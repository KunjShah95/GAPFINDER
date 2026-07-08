// ============================================================================
// Annotations Routes
// Rich annotations and highlights on papers
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import { emitToDocument } from '../lib/socket.js';

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateAnnotationSchema = z.object({
    paperId: z.string().uuid(),
    selectionText: z.string().min(1).max(5000),
    highlightText: z.string().max(5000).optional(),
    note: z.string().max(5000).optional(),
    color: z.string().max(7).default('#FFEB3B'),
    startOffset: z.number().int().min(0).optional(),
    endOffset: z.number().int().min(0).optional(),
    section: z.string().max(255).optional(),
    tags: z.array(z.string().max(50)).optional(),
    isShared: z.boolean().optional(),
});

const UpdateAnnotationSchema = z.object({
    highlightText: z.string().max(5000).optional(),
    note: z.string().max(5000).optional(),
    color: z.string().max(7).optional(),
    tags: z.array(z.string().max(50)).optional(),
    isShared: z.boolean().optional(),
});

// ============================================================================
// GET /annotations — List annotations (optionally by paper)
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const paperId = req.query.paperId as string;
        const color = req.query.color as string;
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const offset = (page - 1) * limit;

        const conditions: string[] = ['a.user_id = $1'];
        const params: any[] = [userId];
        let paramIndex = 2;

        if (paperId) {
            conditions.push(`a.paper_id = $${paramIndex++}`);
            params.push(paperId);
        }
        if (color) {
            conditions.push(`a.color = $${paramIndex++}`);
            params.push(color);
        }

        const whereClause = conditions.join(' AND ');

        const result = await query(
            `SELECT a.*, p.title as paper_title
             FROM annotations a
             LEFT JOIN papers p ON p.id = a.paper_id
             WHERE ${whereClause}
             ORDER BY a.start_offset ASC NULLS LAST, a.created_at ASC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        );

        const countResult = await query(
            `SELECT COUNT(*) as total FROM annotations a WHERE ${whereClause}`,
            params
        );

        res.json({
            annotations: result.rows,
            pagination: {
                page, limit,
                total: parseInt(countResult.rows[0].total),
                totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
            },
        });
    } catch (error) {
        console.error('[Annotations] List error:', error);
        res.status(500).json({ error: 'Failed to fetch annotations' });
    }
});

// ============================================================================
// GET /annotations/export — Export annotations for a paper
// ============================================================================

router.get('/export', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const paperId = req.query.paperId as string;
        const format = (req.query.format as string) || 'json';

        const conditions: string[] = ['a.user_id = $1'];
        const params: any[] = [userId];
        let paramIndex = 2;

        if (paperId) {
            conditions.push(`a.paper_id = $${paramIndex++}`);
            params.push(paperId);
        }

        const whereClause = conditions.join(' AND ');

        const result = await query(
            `SELECT a.*, p.title as paper_title, p.url as paper_url
             FROM annotations a
             LEFT JOIN papers p ON p.id = a.paper_id
             WHERE ${whereClause}
             ORDER BY p.title, a.start_offset ASC NULLS LAST`,
            params
        );

        if (format === 'markdown') {
            let md = `# Research Annotations\n\nExported: ${new Date().toISOString()}\n\n---\n\n`;

            const grouped: Record<string, any[]> = {};
            for (const a of result.rows) {
                const key = a.paper_title || 'Uncategorized';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(a);
            }

            for (const [paperTitle, annotations] of Object.entries(grouped)) {
                md += `## ${paperTitle}\n\n`;
                for (const a of annotations) {
                    md += `> ${a.selection_text}\n\n`;
                    if (a.highlight_text) md += `**Highlight:** ${a.highlight_text}\n\n`;
                    if (a.note) md += `*Note:* ${a.note}\n\n`;
                    if (a.tags?.length) md += `*Tags:* ${a.tags.join(', ')}\n\n`;
                    md += `---\n\n`;
                }
            }

            res.setHeader('Content-Type', 'text/markdown');
            res.setHeader('Content-Disposition', `attachment; filename="annotations-${Date.now()}.md"`);
            res.send(md);
        } else {
            res.json({ annotations: result.rows, total: result.rows.length });
        }
    } catch (error) {
        console.error('[Annotations] Export error:', error);
        res.status(500).json({ error: 'Failed to export annotations' });
    }
});

// ============================================================================
// GET /annotations/paper/:paperId/summary — Get annotation summary for a paper
// ============================================================================

router.get('/paper/:paperId/summary', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const paperId = req.params.paperId;

        const [annotations, stats] = await Promise.all([
            query(
                `SELECT * FROM annotations
                 WHERE user_id = $1 AND paper_id = $2
                 ORDER BY start_offset ASC NULLS LAST, created_at ASC`,
                [userId, paperId]
            ),
            query(
                `SELECT 
                    COUNT(*) as total_annotations,
                    COUNT(*) FILTER (WHERE note IS NOT NULL AND note != '') as with_notes,
                    COUNT(DISTINCT color) as colors_used
                 FROM annotations
                 WHERE user_id = $1 AND paper_id = $2`,
                [userId, paperId]
            ),
        ]);

        res.json({
            annotations: annotations.rows,
            summary: stats.rows[0],
        });
    } catch (error) {
        console.error('[Annotations] Summary error:', error);
        res.status(500).json({ error: 'Failed to fetch annotation summary' });
    }
});

// ============================================================================
// POST /annotations — Create annotation
// ============================================================================

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateAnnotationSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { paperId, selectionText, highlightText, note, color, startOffset, endOffset, section, tags, isShared } = parsed.data;

        const result = await query(
            `INSERT INTO annotations (user_id, paper_id, selection_text, highlight_text, note, color,
                                      start_offset, end_offset, section, position, tags, is_shared,
                                      document_id, document_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING *`,
            [
                req.user!.userId,
                paperId,
                selectionText,
                highlightText || null,
                note || null,
                color,
                startOffset || null,
                endOffset || null,
                section || null,
                JSON.stringify({
                    startOffset: startOffset || 0,
                    endOffset: endOffset || 0,
                    section: section || null,
                }),
                tags || [],
                isShared || false,
                paperId,
                'paper',
            ]
        );

        emitToDocument('paper', paperId, 'annotation:created', result.rows[0]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[Annotations] Create error:', error);
        res.status(500).json({ error: 'Failed to create annotation' });
    }
});

// ============================================================================
// PATCH /annotations/:id — Update annotation
// ============================================================================

router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = UpdateAnnotationSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const data = parsed.data;
        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (data.highlightText !== undefined) {
            updates.push(`highlight_text = $${paramIndex++}`);
            params.push(data.highlightText);
        }
        if (data.note !== undefined) {
            updates.push(`note = $${paramIndex++}`);
            params.push(data.note);
        }
        if (data.color !== undefined) {
            updates.push(`color = $${paramIndex++}`);
            params.push(data.color);
        }
        if (data.tags !== undefined) {
            updates.push(`tags = $${paramIndex++}`);
            params.push(data.tags);
        }
        if (data.isShared !== undefined) {
            updates.push(`is_shared = $${paramIndex++}`);
            params.push(data.isShared);
        }

        if (updates.length === 0) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }

        updates.push(`updated_at = NOW()`);
        params.push(req.params.id, req.user!.userId);

        const result = await query(
            `UPDATE annotations SET ${updates.join(', ')} 
             WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
             RETURNING *`,
            params
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Annotation not found' });
            return;
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('[Annotations] Update error:', error);
        res.status(500).json({ error: 'Failed to update annotation' });
    }
});

// ============================================================================
// DELETE /annotations/:id — Delete annotation
// ============================================================================

router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `DELETE FROM annotations WHERE id = $1 AND user_id = $2 RETURNING id`,
            [req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Annotation not found' });
            return;
        }

        res.json({ message: 'Annotation deleted' });
    } catch (error) {
        console.error('[Annotations] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete annotation' });
    }
});

// ============================================================================
// POST /annotations/:id/replies — Add reply to annotation
// ============================================================================

router.post('/:id/replies', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { text } = req.body;
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            res.status(400).json({ error: 'Text is required' });
            return;
        }

        // Verify annotation exists
        const annotationCheck = await query(
            `SELECT id FROM annotations WHERE id = $1`,
            [req.params.id]
        );
        if (annotationCheck.rows.length === 0) {
            res.status(404).json({ error: 'Annotation not found' });
            return;
        }

        const result = await query(
            `INSERT INTO annotation_replies (annotation_id, user_id, text)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [req.params.id, req.user!.userId, text.trim()]
        );

        // Increment reply count
        await query(
            `UPDATE annotations SET reply_count = reply_count + 1 WHERE id = $1`,
            [req.params.id]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[Annotations] Reply create error:', error);
        res.status(500).json({ error: 'Failed to create reply' });
    }
});

// ============================================================================
// GET /annotations/:id/replies — List replies for an annotation
// ============================================================================

router.get('/:id/replies', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT ar.*, u.name as user_name, u.avatar as user_avatar
             FROM annotation_replies ar
             JOIN users u ON u.id = ar.user_id
             WHERE ar.annotation_id = $1
             ORDER BY ar.created_at ASC`,
            [req.params.id]
        );

        res.json({ replies: result.rows });
    } catch (error) {
        console.error('[Annotations] Replies list error:', error);
        res.status(500).json({ error: 'Failed to fetch replies' });
    }
});

export default router;
