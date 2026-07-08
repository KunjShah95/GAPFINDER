// ============================================================================
// Knowledge Graph Routes
// CRUD for knowledge nodes and edges, subgraph traversal, auto-build
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const NodeTypes = ['paper', 'gap', 'concept', 'author', 'institution', 'dataset', 'method'] as const;
const EdgeTypes = ['cites', 'addresses', 'uses', 'extends', 'contradicts', 'authored_by', 'affiliated_with'] as const;

const CreateNodeSchema = z.object({
    type: z.enum(NodeTypes),
    name: z.string().min(1).max(500),
    metadata: z.record(z.string(), z.unknown()).optional(),
    text: z.string().max(10000).optional(),
});

const CreateEdgeSchema = z.object({
    sourceId: z.string().uuid(),
    targetId: z.string().uuid(),
    type: z.enum(EdgeTypes),
    weight: z.number().min(0).max(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

const AutoBuildSchema = z.object({
    createConceptNodes: z.boolean().default(true),
    createAuthorNodes: z.boolean().default(true),
    maxConcepts: z.number().int().min(1).max(200).default(50),
});

// ============================================================================
// GET /knowledge-graph/nodes — List nodes with filtering
// ============================================================================

router.get('/nodes', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const nodeType = req.query.type as string;
        const search = req.query.search as string;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const offset = parseInt(req.query.offset as string) || 0;

        const conditions: string[] = ['n.user_id = $1'];
        const params: any[] = [userId];
        let paramIndex = 2;

        if (nodeType) {
            conditions.push(`n.node_type = $${paramIndex++}`);
            params.push(nodeType);
        }
        if (search) {
            conditions.push(`to_tsvector('english', n.label) @@ plainto_tsquery('english', $${paramIndex++})`);
            params.push(search);
        }

        const whereClause = conditions.join(' AND ');

        const countResult = await query(
            `SELECT COUNT(*) as total FROM knowledge_nodes n WHERE ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].total);

        const result = await query(
            `SELECT n.*,
                    (SELECT COUNT(*) FROM knowledge_edges e WHERE e.source_id = n.id OR e.target_id = n.id) as connection_count
             FROM knowledge_nodes n
             WHERE ${whereClause}
             ORDER BY n.created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        );

        res.json({
            nodes: result.rows,
            pagination: { limit, offset, total },
        });
    } catch (error) {
        console.error('[KnowledgeGraph] List nodes error:', error);
        res.status(500).json({ error: 'Failed to fetch nodes' });
    }
});

// ============================================================================
// POST /knowledge-graph/nodes — Create a node
// ============================================================================

router.post('/nodes', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateNodeSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { type, name, metadata, text } = parsed.data;
        const userId = req.user!.userId;

        // Generate embedding from text if provided, otherwise from name
        let embedding: string | null = null;
        const textForEmbedding = text || name;
        try {
            const geminiKey = process.env.GEMINI_API_KEY;
            if (geminiKey) {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: 'models/text-embedding-004',
                            content: { parts: [{ text: textForEmbedding }] },
                        }),
                    }
                );
                if (response.ok) {
                    const data = await response.json() as any;
                    embedding = JSON.stringify(data.embedding?.values || []);
                }
            }
        } catch {
            // Embedding is optional — continue without it
        }

        const result = await query(
            `INSERT INTO knowledge_nodes (user_id, node_type, label, properties, embedding)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [userId, type, name, JSON.stringify(metadata || {}), embedding]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[KnowledgeGraph] Create node error:', error);
        res.status(500).json({ error: 'Failed to create node' });
    }
});

// ============================================================================
// GET /knowledge-graph/nodes/:id — Get node detail with connected edges
// ============================================================================

router.get('/nodes/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const nodeId = req.params.id;

        const nodeResult = await query(
            `SELECT * FROM knowledge_nodes WHERE id = $1 AND user_id = $2`,
            [nodeId, userId]
        );

        if (nodeResult.rows.length === 0) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }

        const edgesResult = await query(
            `SELECT e.*,
                    sn.label as source_label, sn.node_type as source_type,
                    tn.label as target_label, tn.node_type as target_type
             FROM knowledge_edges e
             JOIN knowledge_nodes sn ON sn.id = e.source_id
             JOIN knowledge_nodes tn ON tn.id = e.target_id
             WHERE e.source_id = $1 OR e.target_id = $1
             ORDER BY e.created_at DESC`,
            [nodeId]
        );

        res.json({
            node: nodeResult.rows[0],
            edges: edgesResult.rows,
        });
    } catch (error) {
        console.error('[KnowledgeGraph] Get node error:', error);
        res.status(500).json({ error: 'Failed to fetch node' });
    }
});

// ============================================================================
// DELETE /knowledge-graph/nodes/:id — Delete node and its edges
// ============================================================================

router.delete('/nodes/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const nodeId = req.params.id;

        const result = await transaction(async (client) => {
            // Delete edges first (CASCADE handles this, but explicit for clarity)
            await client.query(
                `DELETE FROM knowledge_edges WHERE (source_id = $1 OR target_id = $1) AND user_id = $2`,
                [nodeId, userId]
            );

            const deleteResult = await client.query(
                `DELETE FROM knowledge_nodes WHERE id = $1 AND user_id = $2 RETURNING id`,
                [nodeId, userId]
            );

            return deleteResult.rows[0];
        });

        if (!result) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }

        res.json({ message: 'Node deleted' });
    } catch (error) {
        console.error('[KnowledgeGraph] Delete node error:', error);
        res.status(500).json({ error: 'Failed to delete node' });
    }
});

// ============================================================================
// GET /knowledge-graph/edges — List edges with filtering
// ============================================================================

router.get('/edges', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const sourceId = req.query.sourceId as string;
        const targetId = req.query.targetId as string;
        const edgeType = req.query.type as string;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const offset = parseInt(req.query.offset as string) || 0;

        const conditions: string[] = ['e.user_id = $1'];
        const params: any[] = [userId];
        let paramIndex = 2;

        if (sourceId) {
            conditions.push(`e.source_id = $${paramIndex++}`);
            params.push(sourceId);
        }
        if (targetId) {
            conditions.push(`e.target_id = $${paramIndex++}`);
            params.push(targetId);
        }
        if (edgeType) {
            conditions.push(`e.edge_type = $${paramIndex++}`);
            params.push(edgeType);
        }

        const whereClause = conditions.join(' AND ');

        const countResult = await query(
            `SELECT COUNT(*) as total FROM knowledge_edges e WHERE ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].total);

        const result = await query(
            `SELECT e.*,
                    sn.label as source_label, sn.node_type as source_type,
                    tn.label as target_label, tn.node_type as target_type
             FROM knowledge_edges e
             JOIN knowledge_nodes sn ON sn.id = e.source_id
             JOIN knowledge_nodes tn ON tn.id = e.target_id
             WHERE ${whereClause}
             ORDER BY e.created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        );

        res.json({
            edges: result.rows,
            pagination: { limit, offset, total },
        });
    } catch (error) {
        console.error('[KnowledgeGraph] List edges error:', error);
        res.status(500).json({ error: 'Failed to fetch edges' });
    }
});

// ============================================================================
// POST /knowledge-graph/edges — Create an edge
// ============================================================================

router.post('/edges', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateEdgeSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { sourceId, targetId, type, weight, metadata } = parsed.data;
        const userId = req.user!.userId;

        // Verify both nodes exist and belong to user
        const nodesCheck = await query(
            `SELECT id, label, node_type FROM knowledge_nodes WHERE id IN ($1, $2) AND user_id = $3`,
            [sourceId, targetId, userId]
        );

        if (nodesCheck.rows.length !== 2) {
            res.status(404).json({ error: 'One or both nodes not found' });
            return;
        }

        // Prevent self-loops
        if (sourceId === targetId) {
            res.status(400).json({ error: 'Cannot create edge from node to itself' });
            return;
        }

        const result = await query(
            `INSERT INTO knowledge_edges (user_id, source_id, target_id, edge_type, weight, properties)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (source_id, target_id, edge_type) DO UPDATE SET weight = $5, properties = $6
             RETURNING *`,
            [userId, sourceId, targetId, type, weight ?? 1.0, JSON.stringify(metadata || {})]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[KnowledgeGraph] Create edge error:', error);
        res.status(500).json({ error: 'Failed to create edge' });
    }
});

// ============================================================================
// DELETE /knowledge-graph/edges/:id — Delete edge
// ============================================================================

router.delete('/edges/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `DELETE FROM knowledge_edges WHERE id = $1 AND user_id = $2 RETURNING id`,
            [req.params.id, userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Edge not found' });
            return;
        }

        res.json({ message: 'Edge deleted' });
    } catch (error) {
        console.error('[KnowledgeGraph] Delete edge error:', error);
        res.status(500).json({ error: 'Failed to delete edge' });
    }
});

// ============================================================================
// GET /knowledge-graph/subgraph — Get subgraph around a node (N hops)
// ============================================================================

router.get('/subgraph', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const nodeId = req.query.nodeId as string;
        const depth = Math.min(parseInt(req.query.depth as string) || 2, 4);

        if (!nodeId) {
            res.status(400).json({ error: 'nodeId query parameter is required' });
            return;
        }

        // Verify center node exists
        const centerCheck = await query(
            `SELECT id FROM knowledge_nodes WHERE id = $1 AND user_id = $2`,
            [nodeId, userId]
        );
        if (centerCheck.rows.length === 0) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }

        // BFS to find all nodes and edges within N hops
        const visitedNodes = new Set<string>([nodeId]);
        let frontier = [nodeId];
        const allEdges: any[] = [];

        for (let hop = 0; hop < depth; hop++) {
            if (frontier.length === 0) break;

            const placeholders = frontier.map((_, i) => `$${i + 2}`).join(', ');
            const edgesResult = await query(
                `SELECT e.*,
                        sn.label as source_label, sn.node_type as source_type,
                        tn.label as target_label, tn.node_type as target_type
                 FROM knowledge_edges e
                 JOIN knowledge_nodes sn ON sn.id = e.source_id
                 JOIN knowledge_nodes tn ON tn.id = e.target_id
                 WHERE (e.source_id IN (${placeholders}) OR e.target_id IN (${placeholders}))
                   AND e.user_id = $1`,
                [userId, ...frontier, ...frontier]
            );

            const nextFrontier: string[] = [];
            for (const edge of edgesResult.rows) {
                allEdges.push(edge);
                const neighborId = frontier.includes(edge.source_id) ? edge.target_id : edge.source_id;
                if (!visitedNodes.has(neighborId)) {
                    visitedNodes.add(neighborId);
                    nextFrontier.push(neighborId);
                }
            }
            frontier = nextFrontier;
        }

        // Fetch all discovered nodes
        const nodeIds = Array.from(visitedNodes);
        const nodesResult = await query(
            `SELECT n.*,
                    (SELECT COUNT(*) FROM knowledge_edges e WHERE e.source_id = n.id OR e.target_id = n.id) as connection_count
             FROM knowledge_nodes n
             WHERE n.id = ANY($1) AND n.user_id = $2`,
            [nodeIds, userId]
        );

        // Deduplicate edges
        const uniqueEdges = Array.from(
            new Map(allEdges.map((e) => [e.id, e])).values()
        );

        res.json({
            centerNodeId: nodeId,
            depth,
            nodes: nodesResult.rows,
            edges: uniqueEdges,
        });
    } catch (error) {
        console.error('[KnowledgeGraph] Subgraph error:', error);
        res.status(500).json({ error: 'Failed to fetch subgraph' });
    }
});

// ============================================================================
// GET /knowledge-graph/stats — Graph statistics
// ============================================================================

router.get('/stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const [nodeStats, edgeStats, mostConnected, densityResult] = await Promise.all([
            query(
                `SELECT node_type, COUNT(*) as count
                 FROM knowledge_nodes WHERE user_id = $1
                 GROUP BY node_type ORDER BY count DESC`,
                [userId]
            ),
            query(
                `SELECT edge_type, COUNT(*) as count
                 FROM knowledge_edges WHERE user_id = $1
                 GROUP BY edge_type ORDER BY count DESC`,
                [userId]
            ),
            query(
                `SELECT n.id, n.label, n.node_type,
                        (SELECT COUNT(*) FROM knowledge_edges e WHERE e.source_id = n.id OR e.target_id = n.id) as connection_count
                 FROM knowledge_nodes n
                 WHERE n.user_id = $1
                 ORDER BY connection_count DESC
                 LIMIT 10`,
                [userId]
            ),
            query(
                `SELECT
                    (SELECT COUNT(*) FROM knowledge_nodes WHERE user_id = $1) as total_nodes,
                    (SELECT COUNT(*) FROM knowledge_edges WHERE user_id = $1) as total_edges`,
                [userId]
            ),
        ]);

        const totalNodes = parseInt(densityResult.rows[0].total_nodes);
        const totalEdges = parseInt(densityResult.rows[0].total_edges);
        const maxEdges = totalNodes > 1 ? (totalNodes * (totalNodes - 1)) / 2 : 0;

        res.json({
            totalNodes,
            totalEdges,
            nodesByType: Object.fromEntries(nodeStats.rows.map((r) => [r.node_type, parseInt(r.count)])),
            edgesByType: Object.fromEntries(edgeStats.rows.map((r) => [r.edge_type, parseInt(r.count)])),
            mostConnected: mostConnected.rows,
            density: maxEdges > 0 ? parseFloat((totalEdges / maxEdges).toFixed(4)) : 0,
        });
    } catch (error) {
        console.error('[KnowledgeGraph] Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch graph stats' });
    }
});

// ============================================================================
// POST /knowledge-graph/auto-build — Auto-build graph from papers/gaps
// ============================================================================

router.post('/auto-build', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = AutoBuildSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { createConceptNodes, createAuthorNodes, maxConcepts } = parsed.data;
        const userId = req.user!.userId;

        const stats = { nodesCreated: 0, edgesCreated: 0 };

        await transaction(async (client) => {
            // 1. Create paper nodes from existing papers
            const papers = await client.query(
                `SELECT id, title, authors, abstract, venue, year, url
                 FROM papers WHERE user_id = $1`,
                [userId]
            );

            const paperNodeMap = new Map<string, string>();

            for (const paper of papers.rows) {
                // Check if paper node already exists
                const existing = await client.query(
                    `SELECT id FROM knowledge_nodes WHERE user_id = $1 AND node_type = 'paper' AND properties->>'paperId' = $2`,
                    [userId, paper.id]
                );

                let nodeResult;
                if (existing.rows.length > 0) {
                    paperNodeMap.set(paper.id, existing.rows[0].id);
                } else {
                    nodeResult = await client.query(
                        `INSERT INTO knowledge_nodes (user_id, node_type, label, properties)
                         VALUES ($1, 'paper', $2, $3)
                         RETURNING id`,
                        [userId, paper.title, JSON.stringify({
                            paperId: paper.id,
                            url: paper.url,
                            venue: paper.venue,
                            year: paper.year,
                            authors: paper.authors,
                        })]
                    );
                    paperNodeMap.set(paper.id, nodeResult.rows[0].id);
                    stats.nodesCreated++;
                }
            }

            // 2. Create gap nodes from existing gaps
            const gaps = await client.query(
                `SELECT g.id, g.problem, g.type, g.paper_id, g.impact_score
                 FROM gaps g WHERE g.user_id = $1`,
                [userId]
            );

            const gapNodeMap = new Map<string, string>();

            for (const gap of gaps.rows) {
                const existing = await client.query(
                    `SELECT id FROM knowledge_nodes WHERE user_id = $1 AND node_type = 'gap' AND properties->>'gapId' = $2`,
                    [userId, gap.id]
                );

                let nodeResult;
                if (existing.rows.length > 0) {
                    gapNodeMap.set(gap.id, existing.rows[0].id);
                } else {
                    nodeResult = await client.query(
                        `INSERT INTO knowledge_nodes (user_id, node_type, label, properties)
                         VALUES ($1, 'gap', $2, $3)
                         RETURNING id`,
                        [userId, gap.problem, JSON.stringify({
                            gapId: gap.id,
                            type: gap.type,
                            impactScore: gap.impact_score,
                        })]
                    );
                    gapNodeMap.set(gap.id, nodeResult.rows[0].id);
                    stats.nodesCreated++;
                }

                // Create "addresses" edge: gap -> paper
                if (paperNodeMap.has(gap.paper_id)) {
                    const sourceId = gapNodeMap.get(gap.id)!;
                    const targetId = paperNodeMap.get(gap.paper_id)!;
                    try {
                        await client.query(
                            `INSERT INTO knowledge_edges (user_id, source_id, target_id, edge_type, weight)
                             VALUES ($1, $2, $3, 'addresses', 1.0)
                             ON CONFLICT (source_id, target_id, edge_type) DO NOTHING`,
                            [userId, sourceId, targetId]
                        );
                        stats.edgesCreated++;
                    } catch {
                        // Edge may already exist
                    }
                }
            }

            // 3. Create concept nodes from keywords if enabled
            if (createConceptNodes) {
                const conceptCounts = new Map<string, number>();

                // Extract concepts from paper titles and abstracts
                for (const paper of papers.rows) {
                    const text = `${paper.title || ''} ${paper.abstract || ''}`.toLowerCase();
                    // Simple keyword extraction: words 4+ chars that appear in research context
                    const stopwords = new Set(['the', 'this', 'that', 'with', 'from', 'have', 'were', 'been', 'were', 'which', 'their', 'about', 'would', 'could', 'should', 'will', 'into', 'also', 'than', 'these', 'other', 'more', 'some', 'such', 'only', 'very', 'just', 'over', 'under', 'most', 'each', 'when', 'what', 'where', 'your', 'does', 'then', 'them', 'they', 'their', 'there', 'here', 'being', 'both', 'between', 'through', 'before', 'after', 'above', 'below', 'while', 'during', 'until', 'using', 'based', 'approach', 'method', 'methodology', 'results', 'paper', 'study', 'model', 'models', 'data', 'training', 'based']);
                    const words = text.match(/[a-z]{4,}/g) || [];
                    for (const word of words) {
                        if (!stopwords.has(word)) {
                            conceptCounts.set(word, (conceptCounts.get(word) || 0) + 1);
                        }
                    }
                }

                // Sort by frequency, take top N
                const topConcepts = Array.from(conceptCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, maxConcepts);

                const conceptNodeMap = new Map<string, string>();

                for (const [conceptName] of topConcepts) {
                    const existing = await client.query(
                        `SELECT id FROM knowledge_nodes WHERE user_id = $1 AND node_type = 'concept' AND label = $2`,
                        [userId, conceptName]
                    );

                    if (existing.rows.length > 0) {
                        conceptNodeMap.set(conceptName, existing.rows[0].id);
                    } else {
                        const nodeResult = await client.query(
                            `INSERT INTO knowledge_nodes (user_id, node_type, label, properties)
                             VALUES ($1, 'concept', $2, $3)
                             RETURNING id`,
                            [userId, conceptName, JSON.stringify({ autoGenerated: true })]
                        );
                        conceptNodeMap.set(conceptName, nodeResult.rows[0].id);
                        stats.nodesCreated++;
                    }
                }

                // Create "uses" edges: paper -> concept
                for (const paper of papers.rows) {
                    const paperNodeId = paperNodeMap.get(paper.id);
                    if (!paperNodeId) continue;

                    const text = `${paper.title || ''} ${paper.abstract || ''}`.toLowerCase();
                    for (const [conceptName] of topConcepts) {
                        if (text.includes(conceptName)) {
                            const conceptNodeId = conceptNodeMap.get(conceptName);
                            if (conceptNodeId) {
                                try {
                                    await client.query(
                                        `INSERT INTO knowledge_edges (user_id, source_id, target_id, edge_type, weight)
                                         VALUES ($1, $2, $3, 'uses', 0.5)
                                         ON CONFLICT (source_id, target_id, edge_type) DO NOTHING`,
                                        [userId, paperNodeId, conceptNodeId]
                                    );
                                    stats.edgesCreated++;
                                } catch {
                                    // Edge may already exist
                                }
                            }
                        }
                    }
                }
            }

            // 4. Create author nodes if enabled
            if (createAuthorNodes) {
                const authorMap = new Map<string, string>();

                for (const paper of papers.rows) {
                    if (!paper.authors?.length) continue;

                    for (const authorName of paper.authors) {
                        if (authorMap.has(authorName)) continue;

                        const existing = await client.query(
                            `SELECT id FROM knowledge_nodes WHERE user_id = $1 AND node_type = 'author' AND label = $2`,
                            [userId, authorName]
                        );

                        if (existing.rows.length > 0) {
                            authorMap.set(authorName, existing.rows[0].id);
                        } else {
                            const nodeResult = await client.query(
                                `INSERT INTO knowledge_nodes (user_id, node_type, label, properties)
                                 VALUES ($1, 'author', $2, $3)
                                 RETURNING id`,
                                [userId, authorName, JSON.stringify({ autoGenerated: true })]
                            );
                            authorMap.set(authorName, nodeResult.rows[0].id);
                            stats.nodesCreated++;
                        }

                        // Create "authored_by" edge: paper -> author
                        const paperNodeId = paperNodeMap.get(paper.id);
                        const authorNodeId = authorMap.get(authorName);
                        if (paperNodeId && authorNodeId) {
                            try {
                                await client.query(
                                    `INSERT INTO knowledge_edges (user_id, source_id, target_id, edge_type, weight)
                                     VALUES ($1, $2, $3, 'authored_by', 1.0)
                                     ON CONFLICT (source_id, target_id, edge_type) DO NOTHING`,
                                    [userId, paperNodeId, authorNodeId]
                                );
                                stats.edgesCreated++;
                            } catch {
                                // Edge may already exist
                            }
                        }
                    }
                }
            }
        });

        res.json({
            message: 'Knowledge graph built successfully',
            stats,
        });
    } catch (error) {
        console.error('[KnowledgeGraph] Auto-build error:', error);
        res.status(500).json({ error: 'Failed to auto-build knowledge graph' });
    }
});

export default router;
