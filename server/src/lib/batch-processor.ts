import { config } from '../config.js';
import { BatchItem, BatchJobType, BatchResultItem, enqueueBatchJob } from '../queues/batch-queue.js';
import { cacheInvalidator } from './cache-invalidation.js';

// ============================================================================
// BATCH PROCESSOR
// Routes to provider-native batch APIs, handles polling and result fetching.
// BullMQ handles aggregation — this module handles the API calls.
// ============================================================================

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // 5 minutes max

// ============================================================================
// PROVIDER BATCH API IMPLEMENTATIONS
// ============================================================================

interface ProviderBatchResponse {
    results: { id: string; content: string; success: boolean; error?: string }[];
    usage?: { inputTokens: number; outputTokens: number };
}

/**
 * OpenAI Batch API — the real one.
 * 1. Upload items as a JSONL file via POST /v1/files
 * 2. Create batch via POST /v1/batches with the file ID
 * 3. Poll GET /v1/batches/{batchId} for completion
 * 4. Fetch results from the batch's output file
 */
async function callOpenAIBatch(items: BatchItem[], model: string, apiKey: string): Promise<ProviderBatchResponse> {
    // Step 1: Build JSONL content — each line is an individual chat completions request
    const jsonlLines = items.map(item => {
        const request = {
            custom_id: item.id,
            method: 'POST',
            url: '/v1/chat/completions',
            body: {
                model,
                messages: [{ role: 'user', content: JSON.stringify(item.payload) }],
                temperature: 0.7,
                max_tokens: 4096,
            },
        };
        return JSON.stringify(request);
    });
    const jsonlContent = jsonlLines.join('\n');

    // Step 2: Upload the JSONL file
    const formData = new FormData();
    const blob = new Blob([jsonlContent], { type: 'application/jsonl' });
    formData.append('file', blob, 'batch_input.jsonl');
    formData.append('purpose', 'batch');

    const uploadResponse = await fetch('https://api.openai.com/v1/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData,
    });

    if (!uploadResponse.ok) {
        const err = await uploadResponse.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(err.error?.message || `OpenAI file upload error: ${uploadResponse.status}`);
    }

    const uploadResult = await uploadResponse.json() as { id: string };
    const fileId = uploadResult.id;

    // Step 3: Create the batch
    const createResponse = await fetch('https://api.openai.com/v1/batches', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            input_file_id: fileId,
            endpoint: '/v1/chat/completions',
            completion_window: '24h',
        }),
    });

    if (!createResponse.ok) {
        const err = await createResponse.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(err.error?.message || `OpenAI batch create error: ${createResponse.status}`);
    }

    const batch = await createResponse.json() as { id: string; status: string };
    const batchId = batch.id;

    // Step 4: Poll for completion
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

        const statusResponse = await fetch(`https://api.openai.com/v1/batches/${batchId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
        });

        if (!statusResponse.ok) continue;

        const status = await statusResponse.json() as {
            status: string;
            output_file_id?: string;
            errors?: { message?: string }[];
        };

        if (status.status === 'completed') {
            if (!status.output_file_id) {
                throw new Error('OpenAI batch completed but no output_file_id');
            }
            return await fetchOpenAIResults(status.output_file_id, items, apiKey);
        }

        if (status.status === 'failed' || status.status === 'expired' || status.status === 'cancelled') {
            const errMsg = status.errors?.[0]?.message || `Batch ${status.status}`;
            throw new Error(`OpenAI batch ${status.status}: ${errMsg}`);
        }
        // status === 'in_progress' or 'finalizing' — keep polling
    }

    throw new Error('OpenAI batch timed out after 5 minutes');
}

async function fetchOpenAIResults(
    outputFileId: string,
    items: BatchItem[],
    apiKey: string
): Promise<ProviderBatchResponse> {
    const downloadResponse = await fetch(`https://api.openai.com/v1/files/${outputFileId}/content`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!downloadResponse.ok) {
        throw new Error(`OpenAI results download error: ${downloadResponse.status}`);
    }

    const text = await downloadResponse.text();
    const lines = text.trim().split('\n').filter(Boolean);

    const resultMap = new Map<string, { content: string; success: boolean; error?: string }>();

    for (const line of lines) {
        const entry = JSON.parse(line) as {
            custom_id: string;
            response?: { body?: { choices?: { message?: { content?: string } }[]; error?: { message?: string } } };
            error?: { message?: string };
        };

        if (entry.error) {
            resultMap.set(entry.custom_id, { content: '', success: false, error: entry.error.message });
        } else if (entry.response?.body?.error) {
            resultMap.set(entry.custom_id, {
                content: '',
                success: false,
                error: entry.response.body.error.message,
            });
        } else {
            const content = entry.response?.body?.choices?.[0]?.message?.content || '';
            resultMap.set(entry.custom_id, { content, success: true });
        }
    }

    const results = items.map(item => {
        const r = resultMap.get(item.id);
        return {
            id: item.id,
            content: r?.content || '',
            success: r?.success ?? false,
            error: r?.error,
        };
    });

    return { results };
}

/**
 * Anthropic Message Batches API — the real one.
 * 1. POST /v1/messages/batches with JSONL body (each line = one message request)
 * 2. Poll GET /v1/messages/batches/{batchId} until processing_status === 'ended'
 * 3. Fetch results from results_url
 */
async function callAnthropicBatch(items: BatchItem[], model: string, apiKey: string): Promise<ProviderBatchResponse> {
    // Step 1: Build JSONL — each line is a message batch request
    const jsonlLines = items.map(item => {
        const request = {
            custom_id: item.id,
            params: {
                model,
                max_tokens: 4096,
                messages: [{ role: 'user' as const, content: JSON.stringify(item.payload) }],
            },
        };
        return JSON.stringify(request);
    });
    const jsonlContent = jsonlLines.join('\n');

    // Step 2: Create the batch
    const createResponse = await fetch('https://api.anthropic.com/v1/messages/batches', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/jsonl',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: jsonlContent,
    });

    if (!createResponse.ok) {
        const err = await createResponse.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(err.error?.message || `Anthropic batch create error: ${createResponse.status}`);
    }

    const batch = await createResponse.json() as { id: string; processing_status: string };
    const batchId = batch.id;

    // Step 3: Poll for completion
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

        const statusResponse = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
        });

        if (!statusResponse.ok) continue;

        const status = await statusResponse.json() as {
            processing_status: string;
            results_url?: string;
        };

        if (status.processing_status === 'ended') {
            if (!status.results_url) {
                throw new Error('Anthropic batch ended but no results_url');
            }
            return await fetchAnthropicResults(status.results_url, items, apiKey);
        }

        if (status.processing_status === 'failed') {
            throw new Error('Anthropic batch processing failed');
        }
    }

    throw new Error('Anthropic batch timed out after 5 minutes');
}

async function fetchAnthropicResults(
    resultsUrl: string,
    items: BatchItem[],
    apiKey: string
): Promise<ProviderBatchResponse> {
    const resultsResponse = await fetch(resultsUrl, {
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
    });

    if (!resultsResponse.ok) {
        throw new Error(`Anthropic batch results error: ${resultsResponse.status}`);
    }

    const resultsText = await resultsResponse.text();
    const resultLines = resultsText.trim().split('\n').filter(Boolean);

    const resultMap = new Map<string, { content: string; success: boolean; error?: string }>();

    for (const line of resultLines) {
        const data = JSON.parse(line) as {
            custom_id: string;
            result?: {
                type: string;
                message?: { content?: { text?: string }[] };
                error?: { type: string; error?: { message?: string } };
            };
        };

        if (data.result?.error) {
            resultMap.set(data.custom_id, {
                content: '',
                success: false,
                error: data.result.error.error?.message || data.result.error.type,
            });
        } else if (data.result?.type === 'succeeded' && data.result.message?.content?.[0]?.text) {
            resultMap.set(data.custom_id, {
                content: data.result.message.content[0].text,
                success: true,
            });
        } else {
            resultMap.set(data.custom_id, { content: '', success: false, error: 'Unknown result format' });
        }
    }

    const results = items.map(item => {
        const r = resultMap.get(item.id);
        return {
            id: item.id,
            content: r?.content || '',
            success: r?.success ?? false,
            error: r?.error,
        };
    });

    return { results };
}

/**
 * Gemini: No native batch API available.
 * Processes items sequentially — real cost savings come from OpenAI/Anthropic batch discounts.
 */
async function callGeminiBatch(items: BatchItem[], model: string, apiKey: string): Promise<ProviderBatchResponse> {
    const results: ProviderBatchResponse['results'] = [];

    for (const item of items) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: JSON.stringify(item.payload) }] }],
                        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
                    }),
                }
            );

            if (!response.ok) {
                results.push({ id: item.id, content: '', success: false, error: `Gemini error: ${response.status}` });
                continue;
            }

            const data = await response.json() as {
                candidates?: { content?: { parts?: { text?: string }[] } }[];
            };
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            results.push({ id: item.id, content, success: true });
        } catch (err) {
            results.push({
                id: item.id,
                content: '',
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return { results };
}

// ============================================================================
// BATCH PROCESSING — called by BullMQ worker
// ============================================================================

/**
 * Process a batch job that has been dispatched via BullMQ.
 * The worker calls this with a BatchJobPayload containing all items to process.
 */
export async function processBatchJob(
    jobType: BatchJobType,
    items: BatchItem[],
    providerOverride?: string
): Promise<BatchResultItem[]> {
    const provider = providerOverride || config.defaultAiProvider;
    const model = getDefaultModel(provider);
    const apiKey = getApiKey(provider);

    if (!apiKey) {
        throw new Error(`No API key configured for provider: ${provider}`);
    }

    console.log(`[BatchProcessor] Processing ${items.length} items as ${jobType} via ${provider}`);

    let batchResponse: ProviderBatchResponse;

    try {
        switch (provider) {
            case 'openai':
                batchResponse = await callOpenAIBatch(items, model, apiKey);
                break;
            case 'anthropic':
                batchResponse = await callAnthropicBatch(items, model, apiKey);
                break;
            case 'gemini':
            default:
                batchResponse = await callGeminiBatch(items, model, apiKey);
                break;
        }
    } catch (batchError) {
        console.error(`[BatchProcessor] Batch API failed, falling back to real-time:`, batchError);
        return await processBatchFallback(items, provider, model, apiKey);
    }

    const results: BatchResultItem[] = batchResponse.results.map(r => ({
        id: r.id,
        success: r.success,
        result: r.success ? r.content : undefined,
        error: r.error,
    }));

    if (jobType === 'bulk-gap-analysis' || jobType === 'knowledge-graph-update') {
        await cacheInvalidator.onGapCreated('batch', 'batch', 'system').catch(() => {});
    }

    console.log(`[BatchProcessor] Batch complete: ${results.filter(r => r.success).length}/${results.length} succeeded`);
    return results;
}

// ============================================================================
// ENQUEUE — callers add items to the batch queue via BullMQ
// ============================================================================

/**
 * Enqueue a single batch item into the BullMQ batch queue.
 * BullMQ handles aggregation via delay groups or the worker batches them.
 * Returns a job ID that can be used to poll for results.
 */
export async function addToBatch(item: BatchItem, jobType: BatchJobType): Promise<string> {
    return enqueueBatchJob({
        jobType,
        items: [item],
        userId: item.payload.userId as string | undefined,
    });
}

/**
 * Enqueue multiple items at once as a single batch job.
 */
export async function addBatch(items: BatchItem[], jobType: BatchJobType): Promise<string> {
    return enqueueBatchJob({
        jobType,
        items,
        userId: items[0]?.payload.userId as string | undefined,
    });
}

// ============================================================================
// FALLBACK — real-time processing when batch API unavailable
// ============================================================================

async function processBatchFallback(
    items: BatchItem[],
    provider: string,
    model: string,
    apiKey: string
): Promise<BatchResultItem[]> {
    if (!apiKey) {
        return items.map(item => ({
            id: item.id,
            success: false,
            error: `No API key for provider: ${provider}`,
        }));
    }

    const results: BatchResultItem[] = [];

    for (const item of items) {
        try {
            let content = '';

            if (provider === 'openai') {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'user', content: JSON.stringify(item.payload) }],
                        temperature: 0.7,
                        max_tokens: 4096,
                    }),
                });
                if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
                const data = await response.json() as { choices?: { message?: { content?: string } }[] };
                content = data.choices?.[0]?.message?.content || '';
            } else if (provider === 'anthropic') {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'user', content: JSON.stringify(item.payload) }],
                        max_tokens: 4096,
                    }),
                });
                if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);
                const data = await response.json() as { content?: { text?: string }[] };
                content = data.content?.[0]?.text || '';
            } else {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: JSON.stringify(item.payload) }] }],
                            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
                        }),
                    }
                );
                if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
                const data = await response.json() as {
                    candidates?: { content?: { parts?: { text?: string }[] } }[];
                };
                content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            }

            results.push({ id: item.id, success: true, result: content });
        } catch (err) {
            results.push({
                id: item.id,
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return results;
}

// ============================================================================
// JOB-TYPE-SPECIFIC BUILDERS
// Build BatchItem arrays for each job type. Callers enqueue these via addBatch.
// ============================================================================

export function buildBulkGapAnalysisItems(rawItems: { id: string; content: string; title: string; language?: string }[]): BatchItem[] {
    const prompt = `You are a meta-research analyst. Analyze each paper and extract research gaps.
For each paper provided, return a JSON object with:
- paperId: the paper identifier
- gaps: array of { problem, type, confidence, impactScore, difficulty }

Return a JSON array of results. Process each paper independently.`;

    return rawItems.map(item => ({
        id: item.id,
        type: 'bulk-gap-analysis' as BatchJobType,
        payload: {
            prompt,
            paperContent: item.content,
            paperTitle: item.title,
            language: item.language || 'en',
        },
    }));
}

export function buildNightlyIngestionItems(rawItems: { id: string; content: string; source: string }[]): BatchItem[] {
    const prompt = `You are a paper classifier. For each paper, extract:
- title, authors, abstract, venue, year, topics (array), summary (2 sentences)
Return as JSON array.`;

    return rawItems.map(item => ({
        id: item.id,
        type: 'nightly-ingestion' as BatchJobType,
        payload: {
            prompt,
            paperContent: item.content,
            source: item.source,
        },
    }));
}

export function buildKnowledgeGraphItems(rawItems: { id: string; paperId: string; content: string; existingEdges?: unknown }[]): BatchItem[] {
    const prompt = `You are a knowledge graph analyst. For each paper, identify:
- concepts: key concepts (array of strings)
- relationships: [{ from, to, type, strength }]
- relatedPapers: [{ paperId, relation }]
Return as JSON array.`;

    return rawItems.map(item => ({
        id: item.id,
        type: 'knowledge-graph-update' as BatchJobType,
        payload: {
            prompt,
            paperId: item.paperId,
            paperContent: item.content,
            existingEdges: item.existingEdges,
        },
    }));
}

export function buildClassificationItems(rawItems: { id: string; title: string; abstract: string; content: string }[]): BatchItem[] {
    const prompt = `You are a paper classifier. For each paper, classify into:
- primaryCategory: main research area
- subCategories: array of sub-areas
- methodology: empirical/theoretical/system/design/survey
- maturityLevel: emerging/growing/mature/declining
Return as JSON array.`;

    return rawItems.map(item => ({
        id: item.id,
        type: 'classification' as BatchJobType,
        payload: {
            prompt,
            paperTitle: item.title,
            paperAbstract: item.abstract,
            paperContent: item.content,
        },
    }));
}

// ============================================================================
// HELPERS
// ============================================================================

function getDefaultModel(provider: string): string {
    switch (provider) {
        case 'openai': return 'gpt-4o-mini';
        case 'anthropic': return 'claude-3-5-haiku-20241022';
        case 'gemini': return 'gemini-2.0-flash';
        default: return 'gemini-2.0-flash';
    }
}

function getApiKey(provider: string): string {
    switch (provider) {
        case 'openai': return config.openaiApiKey;
        case 'anthropic': return config.anthropicApiKey;
        case 'gemini': return config.geminiApiKey;
        default: return config.geminiApiKey;
    }
}
