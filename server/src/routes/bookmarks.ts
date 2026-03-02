// ============================================================================
// Bookmarks & Tags Routes
// Flexible tagging and bookmarking system for papers and gaps
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateTagSchema = z.object({
    name: z.string().min(1).max(50).transform(s => s.toLowerCase().trim()),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const BookmarkSchema = z.object({
    entityId: z.string().uuid(),
    entityType: z.enum(['paper', 'gap', 'collection']),
    tags: z.array(z.string().min(1).max(50)).optional(),
    notes: z.string().max(2000).optional(),
});

// ============================================================================
// GET /bookmarks/tags — List all user tags
// ============================================================================

router.get('/tags', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `SELECT t.*,
                    COUNT(bt.id) as usage_count
             FROM tags t
             LEFT JOIN bookmark_tags bt ON bt.tag_id = t.id
             LEFT JOIN bookmarks b ON b.id = bt.bookmark_id AND b.user_id = $1
             WHERE t.user_id = $1
             GROUP BY t.id
             ORDER BY usage_count DESC, t.name`,
            [userId]
        );

        res.json({ tags: result.rows });
    } catch (error) {
        console.error('[Bookmarks] Tags list error:', error);
        res.status(500).json({ error: 'Failed to fetch tags' });
    }
});

// ============================================================================
// POST /bookmarks/tags — Create tag
// ============================================================================

router.post('/tags', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateTagSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { name, color } = parsed.data;

        // Check if tag already exists for user
        const existing = await query(
            `SELECT id FROM tags WHERE user_id = $1 AND name = $2`,
            [req.user!.userId, name]
        );
        if (existing.rows.length > 0) {
            res.status(409).json({ error: 'Tag already exists', tag: existing.rows[0] });
            return;
        }

        const result = await query(
            `INSERT INTO tags (user_id, name, color)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [req.user!.userId, name, color || '#6366f1']
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[Bookmarks] Tag create error:', error);
        res.status(500).json({ error: 'Failed to create tag' });
    }
});

// ============================================================================
// DELETE /bookmarks/tags/:id — Delete tag
// ============================================================================

router.delete('/tags/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `DELETE FROM tags WHERE id = $1 AND user_id = $2 RETURNING id`,
            [req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Tag not found' });
            return;
        }

        res.json({ message: 'Tag deleted' });
    } catch (error) {
        console.error('[Bookmarks] Tag delete error:', error);
        res.status(500).json({ error: 'Failed to delete tag' });
    }
});

// ============================================================================
// GET /bookmarks — List user's bookmarks
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const entityType = req.query.type as string;
        const tag = req.query.tag as string;
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const offset = (page - 1) * limit;

        const conditions: string[] = ['b.user_id = $1'];
        const params: any[] = [userId];
        let paramIndex = 2;

        if (entityType) {
            conditions.push(`b.entity_type = $${paramIndex++}`);
            params.push(entityType);
        }
        if (tag) {
            conditions.push(`EXISTS (
                SELECT 1 FROM bookmark_tags bt 
                JOIN tags t ON t.id = bt.tag_id 
                WHERE bt.bookmark_id = b.id AND t.name = $${paramIndex++}
            )`);
            params.push(tag);
        }

        const whereClause = conditions.join(' AND ');

        const result = await query(
            `SELECT b.*,
                    COALESCE(json_agg(
                        json_build_object('id', t.id, 'name', t.name, 'color', t.color)
                    ) FILTER (WHERE t.id IS NOT NULL), '[]') as tags,
                    CASE 
                        WHEN b.entity_type = 'paper' THEN (SELECT title FROM papers WHERE id = b.entity_id)
                        WHEN b.entity_type = 'gap' THEN (SELECT LEFT(problem, 100) FROM gaps WHERE id = b.entity_id)
                        WHEN b.entity_type = 'collection' THEN (SELECT name FROM collections WHERE id = b.entity_id)
                    END as entity_title
             FROM bookmarks b
             LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
             LEFT JOIN tags t ON t.id = bt.tag_id
             WHERE ${whereClause}
             GROUP BY b.id
             ORDER BY b.created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        );

        const countResult = await query(
            `SELECT COUNT(*) as total FROM bookmarks b WHERE ${whereClause}`,
            params
        );

        res.json({
            bookmarks: result.rows,
            pagination: {
                page, limit,
                total: parseInt(countResult.rows[0].total),
                totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
            },
        });
    } catch (error) {
        console.error('[Bookmarks] List error:', error);
        res.status(500).json({ error: 'Failed to fetch bookmarks' });
    }
});

// ============================================================================
// POST /bookmarks — Create bookmark
// ============================================================================

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = BookmarkSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { entityId, entityType, tags, notes } = parsed.data;
        const userId = req.user!.userId;

        const result = await transaction(async (client) => {
            // Check if already bookmarked
            const existing = await client.query(
                `SELECT id FROM bookmarks WHERE user_id = $1 AND entity_id = $2 AND entity_type = $3`,
                [userId, entityId, entityType]
            );
            if (existing.rows.length > 0) {
                return { existing: true, bookmark: existing.rows[0] };
            }

            // Create bookmark
            const bookmarkResult = await client.query(
                `INSERT INTO bookmarks (user_id, entity_id, entity_type, notes)
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
                [userId, entityId, entityType, notes || null]
            );

            const bookmark = bookmarkResult.rows[0];

            // Apply tags if provided
            if (tags && tags.length > 0) {
                for (const tagName of tags) {
                    // Get or create tag
                    let tagResult = await client.query(
                        `SELECT id FROM tags WHERE user_id = $1 AND name = $2`,
                        [userId, tagName.toLowerCase().trim()]
                    );

                    if (tagResult.rows.length === 0) {
                        tagResult = await client.query(
                            `INSERT INTO tags (user_id, name) VALUES ($1, $2) RETURNING id`,
                            [userId, tagName.toLowerCase().trim()]
                        );
                    }

                    await client.query(
                        `INSERT INTO bookmark_tags (bookmark_id, tag_id)
                         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                        [bookmark.id, tagResult.rows[0].id]
                    );
                }
            }

            return { existing: false, bookmark };
        });

        if (result.existing) {
            res.status(409).json({ error: 'Already bookmarked', bookmark: result.bookmark });
        } else {
            res.status(201).json(result.bookmark);
        }
    } catch (error) {
        console.error('[Bookmarks] Create error:', error);
        res.status(500).json({ error: 'Failed to create bookmark' });
    }
});

// ============================================================================
// PATCH /bookmarks/:id — Update bookmark notes/tags
// ============================================================================

router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { notes, tags } = req.body;
        const userId = req.user!.userId;

        const result = await transaction(async (client) => {
            // Update notes
            if (notes !== undefined) {
                await client.query(
                    `UPDATE bookmarks SET notes = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
                    [notes, req.params.id, userId]
                );
            }

            // Update tags if provided
            if (tags && Array.isArray(tags)) {
                // Remove all existing tags
                await client.query(
                    `DELETE FROM bookmark_tags WHERE bookmark_id = $1`,
                    [req.params.id]
                );

                // Add new tags
                for (const tagName of tags) {
                    let tagResult = await client.query(
                        `SELECT id FROM tags WHERE user_id = $1 AND name = $2`,
                        [userId, tagName.toLowerCase().trim()]
                    );

                    if (tagResult.rows.length === 0) {
                        tagResult = await client.query(
                            `INSERT INTO tags (user_id, name) VALUES ($1, $2) RETURNING id`,
                            [userId, tagName.toLowerCase().trim()]
                        );
                    }

                    await client.query(
                        `INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                        [req.params.id, tagResult.rows[0].id]
                    );
                }
            }

            // Return updated bookmark
            const updated = await client.query(
                `SELECT b.*, COALESCE(json_agg(
                    json_build_object('id', t.id, 'name', t.name, 'color', t.color)
                 ) FILTER (WHERE t.id IS NOT NULL), '[]') as tags
                 FROM bookmarks b
                 LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
                 LEFT JOIN tags t ON t.id = bt.tag_id
                 WHERE b.id = $1 AND b.user_id = $2
                 GROUP BY b.id`,
                [req.params.id, userId]
            );

            return updated.rows[0];
        });

        if (!result) {
            res.status(404).json({ error: 'Bookmark not found' });
            return;
        }

        res.json(result);
    } catch (error) {
        console.error('[Bookmarks] Update error:', error);
        res.status(500).json({ error: 'Failed to update bookmark' });
    }
});

// ============================================================================
// DELETE /bookmarks/:id — Remove bookmark
// ============================================================================

router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `DELETE FROM bookmarks WHERE id = $1 AND user_id = $2 RETURNING id`,
            [req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Bookmark not found' });
            return;
        }

        res.json({ message: 'Bookmark removed' });
    } catch (error) {
        console.error('[Bookmarks] Delete error:', error);
        res.status(500).json({ error: 'Failed to remove bookmark' });
    }
});

// ============================================================================
// GET /bookmarks/check/:entityType/:entityId — Check if entity is bookmarked
// ============================================================================

router.get('/check/:entityType/:entityId', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT id FROM bookmarks WHERE user_id = $1 AND entity_id = $2 AND entity_type = $3`,
            [req.user!.userId, req.params.entityId, req.params.entityType]
        );

        res.json({ bookmarked: result.rows.length > 0, bookmarkId: result.rows[0]?.id || null });
    } catch (error) {
        console.error('[Bookmarks] Check error:', error);
        res.status(500).json({ error: 'Failed to check bookmark' });
    }
});

export default router;
