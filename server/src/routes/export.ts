// ============================================================================
// Export Routes
// Export papers, gaps, and collections in multiple formats
// ============================================================================

import { Router, Request, Response } from 'express';
import { requireAuth, requireFeature } from '../middleware/auth.js';
import { query } from '../db/client.js';

const router = Router();

// ============================================================================
// GET /export/papers — Export papers in JSON/CSV/BibTeX
// ============================================================================

router.get('/papers', requireAuth, requireFeature('basic_export'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const format = (req.query.format as string) || 'json';
        const collectionId = req.query.collectionId as string;

        let papersQuery = `
            SELECT p.id, p.url, p.title, p.abstract, p.authors, p.venue, p.year,
                   p.citation_count, p.created_at,
                   COUNT(g.id) as gap_count
            FROM papers p
            LEFT JOIN gaps g ON g.paper_id = p.id`;

        const params: any[] = [userId];
        let paramIndex = 2;

        if (collectionId) {
            papersQuery += ` JOIN collection_papers cp ON cp.paper_id = p.id AND cp.collection_id = $${paramIndex++}`;
            params.push(collectionId);
        }

        papersQuery += ` WHERE p.user_id = $1
            GROUP BY p.id
            ORDER BY p.created_at DESC`;

        const result = await query(papersQuery, params);
        const papers = result.rows;

        switch (format) {
            case 'csv':
                const csvHeader = 'Title,Authors,Venue,Year,URL,Citations,Gaps,Added\n';
                const csvRows = papers.map(p =>
                    `"${escapeCsv(p.title)}","${escapeCsv((p.authors || []).join('; '))}","${escapeCsv(p.venue || '')}",${p.year || ''},"${p.url}",${p.citation_count},${p.gap_count},"${p.created_at}"`
                ).join('\n');

                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="gapminer-papers-${Date.now()}.csv"`);
                res.send(csvHeader + csvRows);
                break;

            case 'bibtex':
                const bibtex = papers.map((p, i) => {
                    const key = `paper${i + 1}_${(p.year || 'nd')}`;
                    const authors = (p.authors || []).join(' and ');
                    return `@article{${key},
  title = {${p.title}},
  author = {${authors}},
  year = {${p.year || 'n.d.'}},
  journal = {${p.venue || 'Unknown'}},
  url = {${p.url}},
  note = {${parseInt(p.gap_count)} research gaps identified}
}`;
                }).join('\n\n');

                res.setHeader('Content-Type', 'application/x-bibtex');
                res.setHeader('Content-Disposition', `attachment; filename="gapminer-papers-${Date.now()}.bib"`);
                res.send(bibtex);
                break;

            default: // json
                res.json({ papers, total: papers.length, exportedAt: new Date().toISOString() });
                break;
        }
    } catch (error) {
        console.error('[Export] Papers error:', error);
        res.status(500).json({ error: 'Failed to export papers' });
    }
});

// ============================================================================
// GET /export/gaps — Export gaps in JSON/CSV/Markdown
// ============================================================================

router.get('/gaps', requireAuth, requireFeature('basic_export'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const format = (req.query.format as string) || 'json';
        const type = req.query.type as string;
        const impact = req.query.impact as string;

        const conditions: string[] = ['g.user_id = $1'];
        const params: any[] = [userId];
        let paramIndex = 2;

        if (type) {
            conditions.push(`g.type = $${paramIndex++}`);
            params.push(type);
        }
        if (impact) {
            conditions.push(`g.impact_score = $${paramIndex++}`);
            params.push(impact);
        }

        const result = await query(
            `SELECT g.*, p.title as paper_title, p.url as paper_url, p.venue, p.year
             FROM gaps g
             LEFT JOIN papers p ON p.id = g.paper_id
             WHERE ${conditions.join(' AND ')}
             ORDER BY g.created_at DESC`,
            params
        );

        const gaps = result.rows;

        switch (format) {
            case 'csv':
                const csvHeader = 'Problem,Type,Confidence,Impact,Difficulty,Paper,Venue,Year,Resolved,Upvotes,Added\n';
                const csvRows = gaps.map(g =>
                    `"${escapeCsv(g.problem)}","${g.type}",${g.confidence},"${g.impact_score}","${g.difficulty}","${escapeCsv(g.paper_title || '')}","${escapeCsv(g.venue || '')}",${g.year || ''},${g.is_resolved},${g.upvotes},"${g.created_at}"`
                ).join('\n');

                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="gapminer-gaps-${Date.now()}.csv"`);
                res.send(csvHeader + csvRows);
                break;

            case 'markdown':
                let md = `# Research Gaps Export\n\nExported: ${new Date().toISOString()}\nTotal: ${gaps.length}\n\n---\n\n`;

                const grouped: Record<string, typeof gaps> = {};
                for (const gap of gaps) {
                    const key = gap.type || 'other';
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(gap);
                }

                for (const [gapType, gapList] of Object.entries(grouped)) {
                    md += `## ${gapType.charAt(0).toUpperCase() + gapType.slice(1)} Gaps (${gapList.length})\n\n`;
                    for (const g of gapList) {
                        md += `### ${g.problem.slice(0, 80)}...\n\n`;
                        md += `- **Impact:** ${g.impact_score} | **Difficulty:** ${g.difficulty} | **Confidence:** ${g.confidence}\n`;
                        md += `- **Paper:** [${g.paper_title || 'Unknown'}](${g.paper_url || '#'})\n`;
                        if (g.assumptions?.length) md += `- **Assumptions:** ${g.assumptions.join(', ')}\n`;
                        if (g.evaluation_critique) md += `- **Evaluation Critique:** ${g.evaluation_critique}\n`;
                        md += `- **Upvotes:** ${g.upvotes} | **Resolved:** ${g.is_resolved ? 'Yes' : 'No'}\n\n`;
                    }
                }

                res.setHeader('Content-Type', 'text/markdown');
                res.setHeader('Content-Disposition', `attachment; filename="gapminer-gaps-${Date.now()}.md"`);
                res.send(md);
                break;

            default: // json
                res.json({ gaps, total: gaps.length, exportedAt: new Date().toISOString() });
                break;
        }
    } catch (error) {
        console.error('[Export] Gaps error:', error);
        res.status(500).json({ error: 'Failed to export gaps' });
    }
});

// ============================================================================
// GET /export/collection/:id — Export an entire collection
// ============================================================================

router.get('/collection/:id', requireAuth, requireFeature('all_exports'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const collectionId = req.params.id;

        // Verify ownership
        const collectionResult = await query(
            `SELECT * FROM collections WHERE id = $1 AND user_id = $2`,
            [collectionId, userId]
        );

        if (collectionResult.rows.length === 0) {
            res.status(404).json({ error: 'Collection not found' });
            return;
        }

        const collection = collectionResult.rows[0];

        const [papers, gaps] = await Promise.all([
            query(
                `SELECT p.* FROM papers p
                 JOIN collection_papers cp ON cp.paper_id = p.id
                 WHERE cp.collection_id = $1
                 ORDER BY p.created_at DESC`,
                [collectionId]
            ),
            query(
                `SELECT g.*, p.title as paper_title, p.url as paper_url
                 FROM gaps g
                 JOIN collection_gaps cg ON cg.gap_id = g.id
                 LEFT JOIN papers p ON p.id = g.paper_id
                 WHERE cg.collection_id = $1
                 ORDER BY g.created_at DESC`,
                [collectionId]
            ),
        ]);

        res.json({
            collection: {
                name: collection.name,
                description: collection.description,
                color: collection.color,
            },
            papers: papers.rows,
            gaps: gaps.rows,
            totals: {
                papers: papers.rows.length,
                gaps: gaps.rows.length,
            },
            exportedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Export] Collection error:', error);
        res.status(500).json({ error: 'Failed to export collection' });
    }
});

// ============================================================================
// GET /export/report — Generate a full research report
// ============================================================================

router.get('/report', requireAuth, requireFeature('all_exports'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const [papers, gaps, collections, xp] = await Promise.all([
            query(
                `SELECT COUNT(*) as total,
                        COUNT(DISTINCT venue) as venues,
                        MIN(year)::text as earliest_year,
                        MAX(year)::text as latest_year
                 FROM papers WHERE user_id = $1`,
                [userId]
            ),
            query(
                `SELECT COUNT(*) as total,
                        COUNT(*) FILTER (WHERE is_resolved) as resolved,
                        COUNT(*) FILTER (WHERE impact_score = 'high') as high_impact,
                        json_object_agg(COALESCE(type, 'unknown'), cnt) as by_type
                 FROM (
                    SELECT type, COUNT(*) as cnt FROM gaps WHERE user_id = $1 GROUP BY type
                 ) sub,
                 (SELECT COUNT(*) as total,
                         COUNT(*) FILTER (WHERE is_resolved) as resolved,
                         COUNT(*) FILTER (WHERE impact_score = 'high') as high_impact
                  FROM gaps WHERE user_id = $1
                 ) stats`,
                [userId]
            ).catch(() => ({ rows: [{ total: 0, resolved: 0, high_impact: 0, by_type: {} }] })),
            query(`SELECT COUNT(*) as total FROM collections WHERE user_id = $1`, [userId]),
            query(`SELECT * FROM user_xp WHERE user_id = $1`, [userId]),
        ]);

        const report = {
            generatedAt: new Date().toISOString(),
            user: { id: userId },
            summary: {
                papers: papers.rows[0],
                gaps: gaps.rows[0],
                collections: parseInt(collections.rows[0].total),
                xp: xp.rows[0] || { total_xp: 0, level: 1 },
            },
        };

        res.json(report);
    } catch (error) {
        console.error('[Export] Report error:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// ============================================================================
// HELPER
// ============================================================================

function escapeCsv(str: string): string {
    return str.replace(/"/g, '""').replace(/\n/g, ' ');
}

export default router;
