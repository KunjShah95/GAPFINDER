// ============================================================================
// Annotations Routes
// Rich annotations and highlights on papers
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateAnnotationSchema = z.object({
    paperId: z.string().uuid(),
    highlightText: z.string().min(1).max(5000),
    note: z.string().max(5000).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#fbbf24'),
    position: z.object({
        startOffset: z.number().int().min(0),
        endOffset: z.number().int().min(0),
        section: z.string().max(255).optional(),
    }).optional(),
    tags: z.array(z.string().max(50)).optional(),
});

const UpdateAnnotationSchema = z.object({
    note: z.string().max(5000).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    tags: z.array(z.string().max(50)).optional(),
});

// ============================================================================
// GET /annotations — List annotations (optionally by paper)
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const paperId = req.query.paperId as string;
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

        const whereClause = conditions.join(' AND ');

        const result = await query(
            `SELECT a.*, p.title as paper_title
             FROM annotations a
             LEFT JOIN papers p ON p.id = a.paper_id
             WHERE ${whereClause}
             ORDER BY a.created_at DESC
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
// POST /annotations — Create annotation
// ============================================================================

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateAnnotationSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { paperId, highlightText, note, color, position, tags } = parsed.data;

        // Verify paper belongs to user
        const paperCheck = await query(
            `SELECT id FROM papers WHERE id = $1 AND user_id = $2`,
            [paperId, req.user!.userId]
        );
        if (paperCheck.rows.length === 0) {
            res.status(404).json({ error: 'Paper not found' });
            return;
        }

        const result = await query(
            `INSERT INTO annotations (user_id, paper_id, highlight_text, note, color, 
                                      start_offset, end_offset, section, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                req.user!.userId, paperId, highlightText,
                note || null, color,
                position?.startOffset || null, position?.endOffset || null,
                position?.section || null, tags || [],
            ]
        );

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
                    COUNT(DISTINCT color) as colors_used,
                    ARRAY_AGG(DISTINCT unnest) FILTER (WHERE unnest IS NOT NULL) as all_tags
                 FROM annotations, LATERAL unnest(tags) 
                 WHERE user_id = $1 AND paper_id = $2`,
                [userId, paperId]
            ).catch(() => ({ rows: [{ total_annotations: 0, with_notes: 0, colors_used: 0, all_tags: [] }] })),
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
// GET /annotations/export — Export all annotations as markdown
// ============================================================================

router.get('/export', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const format = (req.query.format as string) || 'json';

        const result = await query(
            `SELECT a.*, p.title as paper_title, p.url as paper_url
             FROM annotations a
             LEFT JOIN papers p ON p.id = a.paper_id
             WHERE a.user_id = $1
             ORDER BY p.title, a.start_offset ASC NULLS LAST`,
            [userId]
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
                    md += `> ${a.highlight_text}\n\n`;
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

export default router;
