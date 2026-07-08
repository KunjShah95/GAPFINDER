import { Worker } from 'bullmq';
import { config } from './config.js';
import { query, closePool } from './db/client.js';
import { PUBLIC_ANALYSIS_QUEUE, PublicAnalysisJobPayload } from './queues/public-analysis.queue.js';
import { BATCH_QUEUE, BatchJobPayload } from './queues/batch-queue.js';
import { getBullConnection, closeRedis } from './queues/redis.js';
import { getAIClient } from './lib/ai-worker.js';
import { defaultBreakerPool } from './lib/circuit-breaker.js';
import { executeWithRetry, RETRY_PRESETS } from './lib/redis-retry.js';
import { cacheInvalidator } from './lib/cache-invalidation.js';
import { processBatchJob } from './lib/batch-processor.js';

// ============================================================================
// CIRCUIT BREAKERS FOR EXTERNAL APIs
// ============================================================================

const firecrawlBreaker = defaultBreakerPool.create({
    name: 'firecrawl',
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 60s before retry after open
});

const aiProviderBreaker = defaultBreakerPool.create({
    name: 'ai-provider',
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
});

// ============================================================================
// WORKER IMPLEMENTATION — Scrape + Analyze
// ============================================================================

async function scrapeUrl(url: string): Promise<{ title: string; content: string; venue?: string; year?: string }> {
    if (!config.firecrawlApiKey) {
        throw new Error('Firecrawl API key not configured');
    }

    return firecrawlBreaker.call(async () => {
        return executeWithRetry(
            async (attempt) => {
                const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${config.firecrawlApiKey}`,
                    },
                    body: JSON.stringify({ url, formats: ['markdown'] }),
                });

                if (!response.ok) {
                    const error: any = await response.json().catch(() => ({}));
                    throw new Error(error.message || `Firecrawl failed with status ${response.status}`);
                }

                const result: any = await response.json();
                if (!result.success) {
                    throw new Error(result.error || 'Failed to scrape URL');
                }

                const data = result.data || {};
                const title = data.metadata?.title || extractTitleFromContent(data.markdown || '') || url;
                const { venue, year } = detectVenueAndYear(url, data.markdown || '');

                return {
                    title,
                    content: data.markdown || '',
                    venue,
                    year,
                };
            },
            RETRY_PRESETS.EXTERNAL_API
        );
    });
}

async function analyzeGaps(content: string, language: string = 'en'): Promise<any[]> {
    if (!config.geminiApiKey && !config.openaiApiKey && !config.anthropicApiKey) {
        throw new Error('No AI provider configured');
    }

    return aiProviderBreaker.call(async () => {
        return executeWithRetry(
            async (attempt) => {
                const aiClient = getAIClient();
                const provider = aiClient.getProvider();

                if (!provider) {
                    throw new Error('AI provider not available');
                }

                const prompt = `You are a meta-research analyst specializing in AI and scientific discovery. Analyze the following academic paper content to extract deep insights.

For each research gap or limitation found, provide:
1. problem: A clear, specific description of the gap
2. type: Choose one: "data", "compute", "evaluation", "theory", "deployment", or "methodology"
3. confidence: Confidence score 0 to 1
4. impactScore: "low", "medium", or "high"
5. difficulty: Difficulty to address: "low", "medium", or "high"
6. assumptions: List of hidden assumptions made by the authors
7. failures: Specific approaches mentioned as failed attempts
8. datasetGaps: Mention of missing or inadequate datasets
9. evaluationCritique: Brief critique of evaluation metrics used

Return your response as a valid JSON array with no markdown wrapper.

Paper content (${language}):
${content.slice(0, 18000)}

Return ONLY the JSON array, no other text.`;

                const response = await provider.call({
                    model: 'gemini-2.0-flash',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    maxTokens: 8192,
                });

                const text = response.content;
                const jsonMatch = text.match(/\[[\s\S]*\]/);

                if (!jsonMatch) {
                    console.warn('[Worker] No JSON array found in response, returning empty gaps');
                    return [];
                }

                try {
                    const rawGaps = JSON.parse(jsonMatch[0]);

                    return rawGaps.map((gap: any) => ({
                        problem: gap.problem || '',
                        type: gap.type || 'methodology',
                        confidence: Math.min(1, Math.max(0, gap.confidence || 0.5)),
                        impactScore: gap.impactScore || 'medium',
                        difficulty: gap.difficulty || 'medium',
                        assumptions: Array.isArray(gap.assumptions) ? gap.assumptions : [],
                        failures: Array.isArray(gap.failures) ? gap.failures : [],
                        datasetGaps: Array.isArray(gap.datasetGaps) ? gap.datasetGaps : [],
                        evaluationCritique: gap.evaluationCritique || '',
                    }));
                } catch (parseErr) {
                    console.error('[Worker] Failed to parse gaps JSON:', parseErr);
                    return [];
                }
            },
            RETRY_PRESETS.EXTERNAL_API
        );
    });
}

async function processPublicAnalysisJob(payload: PublicAnalysisJobPayload): Promise<void> {
    const startedAt = Date.now();

    await query(
        `UPDATE batch_jobs
         SET status = 'processing', started_at = NOW(), progress = 10
         WHERE id = $1`,
        [payload.batchJobId]
    );

    let gaps: any[] = [];
    let paperTitle = '';
    let venue = '';
    let year = '';
    let errorMsg: string | null = null;

    try {
        // Step 1: Scrape the URL
        console.log(`[Worker] Scraping ${payload.url}...`);
        await query(
            `UPDATE batch_jobs SET progress = 20 WHERE id = $1`,
            [payload.batchJobId]
        );

        const scraped = await scrapeUrl(payload.url);
        paperTitle = scraped.title;
        venue = scraped.venue || '';
        year = scraped.year || '';

        console.log(`[Worker] ✅ Scraped: ${paperTitle}`);

        // Step 2: Analyze gaps (if enabled)
        if (payload.includeGaps) {
            console.log('[Worker] Analyzing gaps...');
            await query(
                `UPDATE batch_jobs SET progress = 50 WHERE id = $1`,
                [payload.batchJobId]
            );

            gaps = await analyzeGaps(scraped.content, payload.language);
            console.log(`[Worker] ✅ Found ${gaps.length} gaps`);
        }

        // Step 3: Store paper metadata (if not exists)
        const paperResult = await query(
            `INSERT INTO papers (user_id, title, url, content, venue, year, authors, abstract, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, '', NOW())
             ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title, year = EXCLUDED.year
             RETURNING id`,
            [payload.userId, paperTitle, payload.url, scraped.content.slice(0, 1000000), venue, year ? parseInt(year) : null]
        ).catch((err) => {
            console.warn('[Worker] Paper insert warning:', err.message);
            return { rows: [{ id: null }] };
        });

        const paperId = paperResult.rows[0]?.id;

        // Step 4: Store gaps (if paperId was obtained)
        if (paperId && gaps.length > 0) {
            for (const gap of gaps) {
                await query(
                    `INSERT INTO gaps (user_id, paper_id, problem, type, confidence, impact_score, difficulty, assumptions, failures, dataset_gaps, evaluation_critique)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11)
                     ON CONFLICT DO NOTHING`,
                    [
                        payload.userId,
                        paperId,
                        gap.problem,
                        gap.type,
                        gap.confidence,
                        gap.impactScore,
                        gap.difficulty,
                        JSON.stringify(gap.assumptions),
                        JSON.stringify(gap.failures),
                        JSON.stringify(gap.datasetGaps),
                        gap.evaluationCritique,
                    ]
                ).catch((err) => {
                    console.warn('[Worker] Gap insert warning:', err.message);
                });
            }

            // Invalidate caches after new gaps inserted
            await cacheInvalidator.onGapCreated(
                `gap:${Math.random()}`, // Note: In production, get actual gap IDs
                String(paperId),
                payload.userId
            ).catch((err) => {
                console.warn('[Worker] Cache invalidation warning:', err.message);
            });
        }

        const durationMs = Date.now() - startedAt;

        await query(
            `UPDATE batch_jobs
             SET status = 'completed',
                 progress = 100,
                 processed_items = 1,
                 total_items = 1,
                 output_data = $2::jsonb,
                 completed_at = NOW(),
                 error_message = NULL
             WHERE id = $1`,
            [
                payload.batchJobId,
                JSON.stringify({
                    success: true,
                    paperId,
                    title: paperTitle,
                    url: payload.url,
                    venue,
                    year,
                    gapsFound: gaps.length,
                    gaps,
                    durationMs,
                    processedAt: new Date().toISOString(),
                }),
            ]
        );

        console.log(`[Worker] ✅ Job ${payload.batchJobId} completed in ${durationMs}ms`);
    } catch (err) {
        const durationMs = Date.now() - startedAt;
        errorMsg = err instanceof Error ? err.message : String(err);

        console.error(`[Worker] ❌ Job ${payload.batchJobId} failed:`, errorMsg);

        await query(
            `UPDATE batch_jobs
             SET status = 'failed',
                 progress = 0,
                 completed_at = NOW(),
                 error_message = $2,
                 output_data = $3::jsonb
             WHERE id = $1`,
            [
                payload.batchJobId,
                errorMsg,
                JSON.stringify({
                    success: false,
                    url: payload.url,
                    error: errorMsg,
                    durationMs,
                    failedAt: new Date().toISOString(),
                }),
            ]
        ).catch(() => { });
    }
}

// ============================================================================
// BULLMQ WORKER
// ============================================================================

const publicAnalysisWorker = new Worker<PublicAnalysisJobPayload>(
    PUBLIC_ANALYSIS_QUEUE,
    async (job) => {
        await processPublicAnalysisJob(job.data);
    },
    {
        connection: getBullConnection() as any,
        prefix: config.queuePrefix,
        concurrency: config.queueConcurrency,
    }
);

publicAnalysisWorker.on('completed', (job) => {
    console.log(`[Worker] ✅ Job ${job?.id} completed`);
});

publicAnalysisWorker.on('failed', async (job, error) => {
    console.error(`[Worker] ❌ Job ${job?.id} failed:`, error?.message);
});

// ============================================================================
// BATCH LLM WORKER
// ============================================================================

async function processBatchJobWorker(payload: BatchJobPayload): Promise<void> {
    const startedAt = Date.now();
    console.log(`[BatchWorker] Processing ${payload.jobType} batch with ${payload.items.length} items`);

    try {
        const results = await processBatchJob(
            payload.jobType,
            payload.items,
            payload.provider
        );

        const succeeded = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        const durationMs = Date.now() - startedAt;

        console.log(`[BatchWorker] ✅ ${payload.jobType} complete: ${succeeded} succeeded, ${failed} failed in ${durationMs}ms`);

        // Store completion in DB if batchId is available
        if (payload.batchId) {
            await query(
                `UPDATE batch_jobs
                 SET status = 'completed',
                     progress = 100,
                     processed_items = $2,
                     total_items = $3,
                     output_data = $4::jsonb,
                     completed_at = NOW(),
                     error_message = NULL
                 WHERE id = $1`,
                [
                    payload.batchId,
                    succeeded,
                    payload.items.length,
                    JSON.stringify({
                        success: true,
                        jobType: payload.jobType,
                        results,
                        durationMs,
                        processedAt: new Date().toISOString(),
                    }),
                ]
            ).catch(err => {
                console.error('[BatchWorker] Failed to update batch_jobs:', err.message);
            });
        }
    } catch (err) {
        const durationMs = Date.now() - startedAt;
        const errorMsg = err instanceof Error ? err.message : String(err);

        console.error(`[BatchWorker] ❌ ${payload.jobType} failed:`, errorMsg);

        if (payload.batchId) {
            await query(
                `UPDATE batch_jobs
                 SET status = 'failed',
                     progress = 0,
                     completed_at = NOW(),
                     error_message = $2
                 WHERE id = $1`,
                [payload.batchId, errorMsg]
            ).catch(() => {});
        }
    }
}

const batchWorker = new Worker<BatchJobPayload>(
    BATCH_QUEUE,
    async (job) => {
        await processBatchJobWorker(job.data);
    },
    {
        connection: getBullConnection() as any,
        prefix: config.queuePrefix,
        concurrency: Math.max(1, Math.floor(config.queueConcurrency / 2)), // Lower concurrency for batch
    }
);

batchWorker.on('completed', (job) => {
    console.log(`[BatchWorker] ✅ Job ${job?.id} completed`);
});

batchWorker.on('failed', async (job, error) => {
    console.error(`[BatchWorker] ❌ Job ${job?.id} failed:`, error?.message);
});

console.log(`[Worker] 🚀 Started (queues=${PUBLIC_ANALYSIS_QUEUE},${BATCH_QUEUE}, concurrency=${config.queueConcurrency})`);

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

async function shutdown(signal: string): Promise<void> {
    console.log(`[Worker] ${signal} received — shutting down gracefully...`);
    await publicAnalysisWorker.close();
    await batchWorker.close();
    await closeRedis();
    await closePool();
    console.log('[Worker] 👋 Goodbye!');
    process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractTitleFromContent(content: string): string {
    const lines = content.split('\n').filter(l => l.trim());
    for (const line of lines.slice(0, 10)) {
        const cleaned = line.replace(/^#+\s*/, '').trim();
        if (cleaned.length > 10 && cleaned.length < 300) return cleaned;
    }
    return '';
}

function detectVenueAndYear(url: string, content: string): { venue?: string; year?: string } {
    let venue: string | undefined;
    let year: string | undefined;

    if (url.includes('arxiv.org')) venue = 'arXiv';
    else if (url.includes('openreview.net')) venue = 'OpenReview';
    else if (url.includes('aclanthology.org')) venue = 'ACL';
    else if (url.includes('neurips')) venue = 'NeurIPS';
    else if (url.includes('icml')) venue = 'ICML';
    else if (url.includes('iclr')) venue = 'ICLR';
    else if (url.includes('cvpr')) venue = 'CVPR';
    else if (url.includes('aaai')) venue = 'AAAI';

    const yearMatch = url.match(/20[12]\d/) || content.slice(0, 2000).match(/20[12]\d/);
    if (yearMatch) year = yearMatch[0];

    return { venue, year };
}
