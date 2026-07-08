// ============================================================================
// Workflow Routes
// CRUD + execution for automated research workflows
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client.js';
import { requireAuth, requireFeature } from '../middleware/auth.js';
import { startWorkflowRun } from '../lib/workflow-engine.js';
import { logAuditEvent, AuditActions, getClientInfo } from '../lib/audit-trail.js';

const router = Router();

// ============================================================================
// Helpers
// ============================================================================

function paramStr(val: unknown): string {
    return Array.isArray(val) ? val[0] : String(val);
}

function queryStr(val: unknown, fallback: string): string {
    return typeof val === 'string' ? val : fallback;
}

// ============================================================================
// SCHEMAS
// ============================================================================

const StepSchema = z.object({
    type: z.enum(['analyze', 'summarize', 'alert', 'export']),
    config: z.record(z.string(), z.any()).default({}),
});

const CreateWorkflowSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    trigger: z.enum(['manual', 'schedule', 'event', 'webhook']).default('manual'),
    triggerConfig: z.record(z.string(), z.any()).default({}),
    steps: z.array(StepSchema).min(1).max(20),
    enabled: z.boolean().optional().default(true),
});

const UpdateWorkflowSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    trigger: z.enum(['manual', 'schedule', 'event', 'webhook']).optional(),
    triggerConfig: z.record(z.string(), z.any()).optional(),
    steps: z.array(StepSchema).min(1).max(20).optional(),
    enabled: z.boolean().optional(),
});

// ============================================================================
// Helper: verify workflow ownership
// ============================================================================

async function getWorkflowForUser(workflowId: string, userId: string) {
    const result = await query(
        `SELECT * FROM workflows WHERE id = $1 AND user_id = $2`,
        [workflowId, userId]
    );
    return result.rows[0] || null;
}

// ============================================================================
// GET /api/workflows — List user's workflows
// ============================================================================

router.get('/', requireAuth, requireFeature('team_workflows'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const { status, trigger } = req.query as Record<string, string | undefined>;

        let whereClause = 'w.user_id = $1';
        const params: any[] = [userId];
        let paramIndex = 2;

        if (status === 'active') {
            whereClause += ` AND w.is_active = TRUE`;
        } else if (status === 'paused') {
            whereClause += ` AND w.is_active = FALSE`;
        }

        if (trigger && ['manual', 'schedule', 'event', 'webhook'].includes(trigger)) {
            whereClause += ` AND w.trigger_type = $${paramIndex++}`;
            params.push(trigger);
        }

        const result = await query(
            `SELECT w.*,
                    (SELECT COUNT(*) FROM workflow_runs wr WHERE wr.workflow_id = w.id) AS total_runs,
                    (SELECT wr2.status FROM workflow_runs wr2 WHERE wr2.workflow_id = w.id ORDER BY wr2.created_at DESC LIMIT 1) AS last_run_status
             FROM workflows w
             WHERE ${whereClause}
             ORDER BY w.created_at DESC`,
            params
        );

        res.json({ workflows: result.rows });
    } catch (error) {
        console.error('[Workflows] List error:', error);
        res.status(500).json({ error: 'Failed to fetch workflows' });
    }
});

// ============================================================================
// POST /api/workflows — Create a workflow
// ============================================================================

router.post('/', requireAuth, requireFeature('team_workflows'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateWorkflowSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { name, description, trigger, triggerConfig, steps, enabled } = parsed.data;
        const userId = req.user!.userId;

        const result = await query(
            `INSERT INTO workflows (user_id, name, description, trigger_type, trigger_config, steps, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [userId, name, description || null, trigger, JSON.stringify(triggerConfig), JSON.stringify(steps), enabled]
        );

        const { ipAddress, userAgent } = getClientInfo(req);
        await logAuditEvent({
            userId,
            action: AuditActions.BATCH_JOB_STARTED,
            resourceType: 'workflow',
            resourceId: result.rows[0].id,
            changes: { name, stepCount: steps.length },
            ipAddress,
            userAgent,
        });

        res.status(201).json({ workflow: result.rows[0] });
    } catch (error) {
        console.error('[Workflows] Create error:', error);
        res.status(500).json({ error: 'Failed to create workflow' });
    }
});

// ============================================================================
// GET /api/workflows/:id — Get workflow detail with recent runs
// ============================================================================

router.get('/:id', requireAuth, requireFeature('team_workflows'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const workflow = await getWorkflowForUser(paramStr(req.params.id), userId);

        if (!workflow) {
            res.status(404).json({ error: 'Workflow not found' });
            return;
        }

        const runsResult = await query(
            `SELECT * FROM workflow_runs
             WHERE workflow_id = $1
             ORDER BY created_at DESC
             LIMIT 10`,
            [paramStr(req.params.id)]
        );

        res.json({ workflow, recentRuns: runsResult.rows });
    } catch (error) {
        console.error('[Workflows] Get error:', error);
        res.status(500).json({ error: 'Failed to fetch workflow' });
    }
});

// ============================================================================
// PATCH /api/workflows/:id — Update workflow
// ============================================================================

router.patch('/:id', requireAuth, requireFeature('team_workflows'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = UpdateWorkflowSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const userId = req.user!.userId;
        const data = parsed.data;

        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (data.name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            params.push(data.name);
        }
        if (data.description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            params.push(data.description);
        }
        if (data.trigger !== undefined) {
            updates.push(`trigger_type = $${paramIndex++}`);
            params.push(data.trigger);
        }
        if (data.triggerConfig !== undefined) {
            updates.push(`trigger_config = $${paramIndex++}`);
            params.push(JSON.stringify(data.triggerConfig));
        }
        if (data.steps !== undefined) {
            updates.push(`steps = $${paramIndex++}`);
            params.push(JSON.stringify(data.steps));
        }
        if (data.enabled !== undefined) {
            updates.push(`is_active = $${paramIndex++}`);
            params.push(data.enabled);
        }

        if (updates.length === 0) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }

        params.push(paramStr(req.params.id), userId);

        const result = await query(
            `UPDATE workflows
             SET ${updates.join(', ')}, updated_at = NOW()
             WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
             RETURNING *`,
            params
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Workflow not found' });
            return;
        }

        res.json({ workflow: result.rows[0] });
    } catch (error) {
        console.error('[Workflows] Update error:', error);
        res.status(500).json({ error: 'Failed to update workflow' });
    }
});

// ============================================================================
// DELETE /api/workflows/:id — Delete workflow
// ============================================================================

router.delete('/:id', requireAuth, requireFeature('team_workflows'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `DELETE FROM workflows WHERE id = $1 AND user_id = $2 RETURNING id, name`,
            [paramStr(req.params.id), userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Workflow not found' });
            return;
        }

        await logAuditEvent({
            userId,
            action: 'workflow.deleted',
            resourceType: 'workflow',
            resourceId: paramStr(req.params.id),
            changes: { name: result.rows[0].name },
        });

        res.json({ message: 'Workflow deleted' });
    } catch (error) {
        console.error('[Workflows] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete workflow' });
    }
});

// ============================================================================
// POST /api/workflows/:id/run — Manually trigger a workflow run
// ============================================================================

router.post('/:id/run', requireAuth, requireFeature('team_workflows'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const workflow = await getWorkflowForUser(paramStr(req.params.id), userId);

        if (!workflow) {
            res.status(404).json({ error: 'Workflow not found' });
            return;
        }

        if (!workflow.is_active) {
            res.status(400).json({ error: 'Workflow is paused' });
            return;
        }

        const triggerData = req.body || {};

        const runId = await startWorkflowRun(paramStr(req.params.id), userId, triggerData);

        res.status(201).json({ runId, message: 'Workflow run started' });
    } catch (error: any) {
        console.error('[Workflows] Run error:', error);
        res.status(500).json({ error: error.message || 'Failed to start workflow run' });
    }
});

// ============================================================================
// GET /api/workflows/:id/runs — List workflow runs
// ============================================================================

router.get('/:id/runs', requireAuth, requireFeature('team_workflows'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const workflow = await getWorkflowForUser(paramStr(req.params.id), userId);

        if (!workflow) {
            res.status(404).json({ error: 'Workflow not found' });
            return;
        }

        const page = parseInt(queryStr(req.query.page, '1')) || 1;
        const limit = Math.min(parseInt(queryStr(req.query.limit, '20')) || 20, 100);
        const offset = (page - 1) * limit;

        const result = await query(
            `SELECT * FROM workflow_runs
             WHERE workflow_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [paramStr(req.params.id), limit, offset]
        );

        const countResult = await query(
            `SELECT COUNT(*) as total FROM workflow_runs WHERE workflow_id = $1`,
            [paramStr(req.params.id)]
        );

        res.json({
            runs: result.rows,
            pagination: {
                page,
                limit,
                total: parseInt(countResult.rows[0].total),
            },
        });
    } catch (error) {
        console.error('[Workflows] List runs error:', error);
        res.status(500).json({ error: 'Failed to fetch runs' });
    }
});

// ============================================================================
// GET /api/workflows/runs/:runId — Get run detail with step-by-step results
// ============================================================================

router.get('/runs/:runId', requireAuth, requireFeature('team_workflows'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `SELECT wr.*, w.name as workflow_name
             FROM workflow_runs wr
             JOIN workflows w ON w.id = wr.workflow_id
             WHERE wr.id = $1 AND w.user_id = $2`,
            [paramStr(req.params.runId), userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Run not found' });
            return;
        }

        res.json({ run: result.rows[0] });
    } catch (error) {
        console.error('[Workflows] Get run error:', error);
        res.status(500).json({ error: 'Failed to fetch run' });
    }
});

// ============================================================================
// POST /api/workflows/:id/pause — Pause workflow
// ============================================================================

router.post('/:id/pause', requireAuth, requireFeature('team_workflows'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `UPDATE workflows SET is_active = FALSE, updated_at = NOW()
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [paramStr(req.params.id), userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Workflow not found' });
            return;
        }

        await logAuditEvent({
            userId,
            action: 'workflow.paused',
            resourceType: 'workflow',
            resourceId: paramStr(req.params.id),
        });

        res.json({ workflow: result.rows[0] });
    } catch (error) {
        console.error('[Workflows] Pause error:', error);
        res.status(500).json({ error: 'Failed to pause workflow' });
    }
});

// ============================================================================
// POST /api/workflows/:id/resume — Resume workflow
// ============================================================================

router.post('/:id/resume', requireAuth, requireFeature('team_workflows'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `UPDATE workflows SET is_active = TRUE, updated_at = NOW()
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [paramStr(req.params.id), userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Workflow not found' });
            return;
        }

        await logAuditEvent({
            userId,
            action: 'workflow.resumed',
            resourceType: 'workflow',
            resourceId: paramStr(req.params.id),
        });

        res.json({ workflow: result.rows[0] });
    } catch (error) {
        console.error('[Workflows] Resume error:', error);
        res.status(500).json({ error: 'Failed to resume workflow' });
    }
});

export default router;
