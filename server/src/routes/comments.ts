// ============================================================================
// Comments Routes
// Threaded comments on papers, gaps, and collections
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateCommentSchema = z.object({
    documentType: z.enum(['paper', 'gap', 'collection']),
    documentId: z.string().uuid(),
    text: z.string().min(1).max(5000),
    parentId: z.string().uuid().optional(),
    mentions: z.array(z.string().max(100)).optional(),
});

const UpdateCommentSchema = z.object({
    text: z.string().min(1).max(5000),
});

// ============================================================================
// GET /comments — List comments for a document
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const documentType = req.query.documentType as string;
        const documentId = req.query.documentId as string;
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const offset = (page - 1) * limit;

        if (!documentType || !documentId) {
            res.status(400).json({ error: 'documentType and documentId are required' });
            return;
        }

        const result = await query(
            `SELECT c.*,
                    u.name as user_name,
                    u.avatar as user_avatar,
                    (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id) as reply_count
             FROM comments c
             JOIN users u ON u.id = c.user_id
             WHERE c.document_type = $1 AND c.document_id = $2 AND c.parent_id IS NULL
             ORDER BY c.created_at DESC
             LIMIT $3 OFFSET $4`,
            [documentType, documentId, limit, offset]
        );

        const countResult = await query(
            `SELECT COUNT(*) as total FROM comments 
             WHERE document_type = $1 AND document_id = $2 AND parent_id IS NULL`,
            [documentType, documentId]
        );

        res.json({
            comments: result.rows,
            pagination: {
                page, limit,
                total: parseInt(countResult.rows[0].total),
                totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
            },
        });
    } catch (error) {
        console.error('[Comments] List error:', error);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

// ============================================================================
// GET /comments/:id/replies — List replies for a comment
// ============================================================================

router.get('/:id/replies', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const offset = (page - 1) * limit;

        const result = await query(
            `SELECT c.*,
                    u.name as user_name,
                    u.avatar as user_avatar
             FROM comments c
             JOIN users u ON u.id = c.user_id
             WHERE c.parent_id = $1
             ORDER BY c.created_at ASC
             LIMIT $2 OFFSET $3`,
            [req.params.id, limit, offset]
        );

        const countResult = await query(
            `SELECT COUNT(*) as total FROM comments WHERE parent_id = $1`,
            [req.params.id]
        );

        res.json({
            replies: result.rows,
            pagination: {
                page, limit,
                total: parseInt(countResult.rows[0].total),
                totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
            },
        });
    } catch (error) {
        console.error('[Comments] Replies list error:', error);
        res.status(500).json({ error: 'Failed to fetch replies' });
    }
});

// ============================================================================
// POST /comments — Create comment
// ============================================================================

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateCommentSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { documentType, documentId, text, parentId, mentions } = parsed.data;

        // If replying, verify parent exists and belongs to same document
        if (parentId) {
            const parentCheck = await query(
                `SELECT id, document_type, document_id FROM comments WHERE id = $1`,
                [parentId]
            );
            if (parentCheck.rows.length === 0) {
                res.status(404).json({ error: 'Parent comment not found' });
                return;
            }
            const parent = parentCheck.rows[0];
            if (parent.document_type !== documentType || parent.document_id !== documentId) {
                res.status(400).json({ error: 'Parent comment does not belong to this document' });
                return;
            }
        }

        const result = await query(
            `INSERT INTO comments (user_id, document_type, document_id, text, parent_id, mentions)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [req.user!.userId, documentType, documentId, text, parentId || null, mentions || []]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[Comments] Create error:', error);
        res.status(500).json({ error: 'Failed to create comment' });
    }
});

// ============================================================================
// PATCH /comments/:id — Update comment (owner only)
// ============================================================================

router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = UpdateCommentSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const result = await query(
            `UPDATE comments SET text = $1, updated_at = NOW()
             WHERE id = $2 AND user_id = $3
             RETURNING *`,
            [parsed.data.text, req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Comment not found or not owned by user' });
            return;
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('[Comments] Update error:', error);
        res.status(500).json({ error: 'Failed to update comment' });
    }
});

// ============================================================================
// DELETE /comments/:id — Delete comment (owner or admin)
// ============================================================================

router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const isAdmin = req.user!.role === 'admin';

        const result = await query(
            `DELETE FROM comments WHERE id = $1 AND (${isAdmin ? 'TRUE' : 'user_id = $2'})
             RETURNING id`,
            isAdmin ? [req.params.id] : [req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Comment not found' });
            return;
        }

        res.json({ message: 'Comment deleted' });
    } catch (error) {
        console.error('[Comments] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete comment' });
    }
});

// ============================================================================
// POST /comments/:id/resolve — Mark comment as resolved
// ============================================================================

router.post('/:id/resolve', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `UPDATE comments SET is_resolved = NOT is_resolved, updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Comment not found' });
            return;
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('[Comments] Resolve error:', error);
        res.status(500).json({ error: 'Failed to resolve comment' });
    }
});

export default router;
