// ============================================================================
// Workflow Execution Engine
// Runs workflow steps sequentially with retry support and audit logging
// ============================================================================

import { query } from '../db/client.js';
import { logAuditEvent, AuditActions } from './audit-trail.js';
import { getAIClient } from './ai-worker.js';

// ============================================================================
// Types
// ============================================================================

export type StepType = 'analyze' | 'summarize' | 'alert' | 'export';

export interface WorkflowStep {
    type: StepType;
    config: Record<string, any>;
}

export interface StepResult {
    stepIndex: number;
    type: StepType;
    status: 'completed' | 'failed' | 'skipped';
    output?: any;
    error?: string;
    durationMs: number;
}

export interface WorkflowRunContext {
    runId: string;
    workflowId: string;
    userId: string;
    workflowName: string;
    steps: WorkflowStep[];
    triggerData: Record<string, any>;
}

// ============================================================================
// Step Executors
// ============================================================================

async function executeAnalyzeStep(
    ctx: WorkflowRunContext,
    stepIndex: number,
    config: Record<string, any>,
    previousOutput?: any,
): Promise<any> {
    const ai = getAIClient();
    if (!ai.getProvider()) {
        throw new Error('No AI provider configured for analyze step');
    }

    const paperIds: string[] = config.paperIds || [];
    let paperContext = '';

    if (paperIds.length > 0) {
        const papers = await query(
            `SELECT id, title, abstract, authors, venue, year FROM papers WHERE id = ANY($1) AND user_id = $2`,
            [paperIds, ctx.userId]
        );
        paperContext = papers.rows
            .map((p: any) => `Title: ${p.title}\nAbstract: ${p.abstract || 'N/A'}\nAuthors: ${(p.authors || []).join(', ')}\nVenue: ${p.venue || 'N/A'}\nYear: ${p.year || 'N/A'}`)
            .join('\n\n---\n\n');
    }

    const prompt = config.prompt || 'Analyze the following research papers and identify gaps.';
    const fullPrompt = paperContext
        ? `${prompt}\n\nPapers:\n\n${paperContext}`
        : prompt;

    const result = await ai.call({
        model: config.model || 'gemini-2.0-flash',
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: config.temperature ?? 0.7,
        maxTokens: config.maxTokens ?? 4096,
    });

    return {
        analysis: result.content,
        paperCount: paperIds.length,
    };
}

async function executeSummarizeStep(
    ctx: WorkflowRunContext,
    _stepIndex: number,
    config: Record<string, any>,
    previousOutput?: any,
): Promise<any> {
    const ai = getAIClient();
    if (!ai.getProvider()) {
        throw new Error('No AI provider configured for summarize step');
    }

    const paperIds: string[] = config.paperIds || [];
    let paperContext = '';

    if (paperIds.length > 0) {
        const papers = await query(
            `SELECT id, title, abstract, venue, year FROM papers WHERE id = ANY($1) AND user_id = $2`,
            [paperIds, ctx.userId]
        );
        paperContext = papers.rows
            .map((p: any) => `Title: ${p.title}\nAbstract: ${p.abstract || 'N/A'}\nVenue: ${p.venue || 'N/A'}\nYear: ${p.year || 'N/A'}`)
            .join('\n\n');
    }

    const source = previousOutput?.analysis || previousOutput?.summary || paperContext;
    if (!source) {
        throw new Error('No content available to summarize');
    }

    const prompt = config.prompt || 'Provide a concise summary of the following content:';
    const fullPrompt = `${prompt}\n\n${source}`;

    const result = await ai.call({
        model: config.model || 'gemini-2.0-flash',
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: config.temperature ?? 0.5,
        maxTokens: config.maxTokens ?? 2048,
    });

    return { summary: result.content };
}

async function executeAlertStep(
    ctx: WorkflowRunContext,
    _stepIndex: number,
    config: Record<string, any>,
    previousOutput?: any,
): Promise<any> {
    const condition = config.condition || 'always';
    const message = config.message || 'Workflow step completed';

    let shouldAlert = false;
    if (condition === 'always') {
        shouldAlert = true;
    } else if (condition === 'on_success' && previousOutput) {
        shouldAlert = true;
    } else if (condition === 'on_failure') {
        // Checked at a higher level
        shouldAlert = true;
    }

    if (shouldAlert) {
        // Store notification for the user
        await query(
            `INSERT INTO alert_notifications (alert_id, title, body, notification_type)
             SELECT ra.id, $2, $3, 'in_app'
             FROM research_alerts ra
             WHERE ra.user_id = $1
             LIMIT 1`,
            [ctx.userId, `[Workflow] ${ctx.workflowName}`, message]
        );

        return { notified: true, message };
    }

    return { notified: false };
}

async function executeExportStep(
    ctx: WorkflowRunContext,
    _stepIndex: number,
    config: Record<string, any>,
    previousOutput?: any,
): Promise<any> {
    const exportType = config.format || 'json';
    const resourceType = config.resourceType || 'analysis';
    const data = previousOutput || {};

    // Record export in history
    const result = await query(
        `INSERT INTO export_history (user_id, export_type, resource_type, metadata)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
            ctx.userId,
            exportType,
            resourceType,
            JSON.stringify({
                workflowId: ctx.workflowId,
                workflowName: ctx.workflowName,
                runId: ctx.runId,
                data,
            }),
        ]
    );

    return {
        exportId: result.rows[0]?.id,
        format: exportType,
        resourceType,
    };
}

// ============================================================================
// Step Dispatcher
// ============================================================================

const STEP_EXECUTORS: Record<StepType, (
    ctx: WorkflowRunContext,
    stepIndex: number,
    config: Record<string, any>,
    previousOutput?: any,
) => Promise<any>> = {
    analyze: executeAnalyzeStep,
    summarize: executeSummarizeStep,
    alert: executeAlertStep,
    export: executeExportStep,
};

// ============================================================================
// Main Execution
// ============================================================================

export async function executeWorkflow(
    ctx: WorkflowRunContext,
    maxRetries: number = 1,
): Promise<StepResult[]> {
    const results: StepResult[] = [];
    let previousOutput: any = undefined;

    for (let i = 0; i < ctx.steps.length; i++) {
        const step = ctx.steps[i];
        const stepStart = Date.now();

        let lastError: string | undefined;
        let succeeded = false;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const executor = STEP_EXECUTORS[step.type];
                if (!executor) {
                    throw new Error(`Unknown step type: ${step.type}`);
                }

                const output = await executor(ctx, i, step.config, previousOutput);
                previousOutput = output;

                results.push({
                    stepIndex: i,
                    type: step.type,
                    status: 'completed',
                    output,
                    durationMs: Date.now() - stepStart,
                });

                succeeded = true;
                break;
            } catch (error: any) {
                lastError = error.message || 'Unknown error';
                if (attempt < maxRetries) {
                    console.warn(
                        `[WorkflowEngine] Step ${i} (${step.type}) failed, retrying (${attempt + 1}/${maxRetries}):`,
                        lastError
                    );
                }
            }
        }

        if (!succeeded) {
            results.push({
                stepIndex: i,
                type: step.type,
                status: 'failed',
                error: lastError,
                durationMs: Date.now() - stepStart,
            });
            break; // Stop on failure
        }
    }

    return results;
}

// ============================================================================
// Run Manager — creates run record and orchestrates execution
// ============================================================================

export async function startWorkflowRun(
    workflowId: string,
    userId: string,
    triggerData: Record<string, any> = {},
): Promise<string> {
    // Fetch workflow definition
    const wfResult = await query(
        `SELECT id, name, steps, is_active FROM workflows WHERE id = $1 AND user_id = $2`,
        [workflowId, userId]
    );

    if (wfResult.rows.length === 0) {
        throw new Error('Workflow not found');
    }

    const workflow = wfResult.rows[0];
    if (!workflow.is_active) {
        throw new Error('Workflow is paused');
    }

    const steps: WorkflowStep[] = Array.isArray(workflow.steps) ? workflow.steps : [];

    if (steps.length === 0) {
        throw new Error('Workflow has no steps');
    }

    // Create run record
    const runResult = await query(
        `INSERT INTO workflow_runs (workflow_id, status, input_data, started_at)
         VALUES ($1, 'queued', $2, NOW())
         RETURNING id`,
        [workflowId, JSON.stringify(triggerData)]
    );

    const runId = runResult.rows[0].id;

    // Audit log
    await logAuditEvent({
        userId,
        action: 'workflow.run_started',
        resourceType: 'workflow',
        resourceId: workflowId,
        changes: { runId, stepCount: steps.length },
    });

    // Execute async (fire-and-forget)
    executeWorkflowAsync({
        runId,
        workflowId,
        userId,
        workflowName: workflow.name,
        steps,
        triggerData,
    }).catch((error) => {
        console.error('[WorkflowEngine] Async execution error:', error);
    });

    return runId;
}

async function executeWorkflowAsync(ctx: WorkflowRunContext): Promise<void> {
    const startTime = Date.now();

    try {
        // Mark as running
        await query(
            `UPDATE workflow_runs SET status = 'running', started_at = NOW() WHERE id = $1`,
            [ctx.runId]
        );

        const results = await executeWorkflow(ctx);
        const allSucceeded = results.every((r) => r.status === 'completed');
        const durationMs = Date.now() - startTime;

        await query(
            `UPDATE workflow_runs
             SET status = $1, output_data = $2, duration_ms = $3, completed_at = NOW()
             WHERE id = $4`,
            [
                allSucceeded ? 'completed' : 'failed',
                JSON.stringify({ steps: results }),
                durationMs,
                ctx.runId,
            ]
        );

        // Update workflow run count and last run info
        await query(
            `UPDATE workflows
             SET last_run_at = NOW(), last_run_status = $1, run_count = run_count + 1
             WHERE id = $2`,
            [allSucceeded ? 'completed' : 'failed', ctx.workflowId]
        );

        await logAuditEvent({
            userId: ctx.userId,
            action: allSucceeded ? 'workflow.run_completed' : 'workflow.run_failed',
            resourceType: 'workflow',
            resourceId: ctx.workflowId,
            changes: { runId: ctx.runId, durationMs, stepsCompleted: results.length },
        });
    } catch (error: any) {
        const durationMs = Date.now() - startTime;
        const errorMessage = error.message || 'Unknown execution error';

        await query(
            `UPDATE workflow_runs
             SET status = 'failed', error = $1, duration_ms = $2, completed_at = NOW()
             WHERE id = $3`,
            [errorMessage, durationMs, ctx.runId]
        );

        await query(
            `UPDATE workflows
             SET last_run_at = NOW(), last_run_status = 'failed', run_count = run_count + 1
             WHERE id = $1`,
            [ctx.workflowId]
        );

        await logAuditEvent({
            userId: ctx.userId,
            action: AuditActions.BATCH_JOB_FAILED,
            resourceType: 'workflow',
            resourceId: ctx.workflowId,
            changes: { runId: ctx.runId, error: errorMessage },
        });
    }
}
