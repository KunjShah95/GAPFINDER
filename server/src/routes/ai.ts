// ============================================================================
// AI Proxy Routes
// Secure proxy for multiple AI providers and Firecrawl API
// API keys never leave the server
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { config, getAIProviderConfigs } from '../config.js';
import { requireAuth, requireFeature, checkUsageLimit } from '../middleware/auth.js';
import { query } from '../db/client.js';
import { AIClient, AIMessage, AIProviderType } from '../lib/ai/index.js';
import { routeModel, logRoutingDecision, getRoutingStats } from '../lib/model-router.js';
import { createCachedCallAI, getCacheStats } from '../lib/llm-cache.js';

const router = Router();

const providerOrder: AIProviderType[] = ['gemini', 'openai', 'anthropic', 'openrouter', 'deepseek', 'mistral', 'cohere'];

async function getOrgIntegrations(userId: string): Promise<any | null> {
    const result = await query(
        `SELECT o.settings
         FROM organizations o
         JOIN organization_members om ON om.organization_id = o.id
         WHERE om.user_id = $1 AND om.status = 'active'
         ORDER BY o.created_at DESC
         LIMIT 1`,
        [userId]
    );

    return result.rows[0]?.settings?.integrations || null;
}

function buildProviderConfigs(integrations?: any) {
    const aiProviders = integrations?.aiProviders || {};
    const defaultProvider = integrations?.defaultAiProvider || config.defaultAiProvider;

    const configs = providerOrder
        .map((type) => {
            const envKeyMap: Record<AIProviderType, string> = {
                gemini: config.geminiApiKey,
                openai: config.openaiApiKey,
                anthropic: config.anthropicApiKey,
                openrouter: config.openrouterApiKey,
                deepseek: config.deepseekApiKey,
                mistral: config.mistralApiKey,
                cohere: config.cohereApiKey,
            };

            const integrationKeyMap: Record<AIProviderType, string> = {
                gemini: aiProviders.geminiApiKey,
                openai: aiProviders.openaiApiKey,
                anthropic: aiProviders.anthropicApiKey,
                openrouter: aiProviders.openrouterApiKey,
                deepseek: aiProviders.deepseekApiKey,
                mistral: aiProviders.mistralApiKey,
                cohere: aiProviders.cohereApiKey,
            };

            const apiKey = integrationKeyMap[type] || envKeyMap[type];
            return apiKey ? { type, apiKey, default: type === defaultProvider } : null;
        })
        .filter(Boolean) as { type: AIProviderType; apiKey: string; default?: boolean }[];

    if (!configs.some(cfg => cfg.default) && configs.length > 0) {
        configs[0].default = true;
    }

    return configs;
}

async function getFirecrawlApiKey(userId: string): Promise<string> {
    const integrations = await getOrgIntegrations(userId);
    return integrations?.searchProviders?.firecrawlApiKey || config.firecrawlApiKey;
}

// ============================================================================
// AI CLIENT (Lazy initialized)
// ============================================================================

let aiClient: AIClient | null = null;

function getAIClient(): AIClient {
    if (!aiClient) {
        const providerConfigs = getAIProviderConfigs();
        if (providerConfigs.length === 0) {
            throw new Error('No AI provider configured');
        }
        aiClient = new AIClient(providerConfigs);
    }
    return aiClient;
}

// ============================================================================
// UNIFIED AI CALL
// ============================================================================

async function callAIDirect(
    prompt: string, 
    model?: string, 
    providerType?: AIProviderType,
    systemPrompt?: string,
    userId?: string,
    paperCount?: number
): Promise<string> {
    const integrations = userId ? await getOrgIntegrations(userId) : null;
    const providerConfigs = buildProviderConfigs(integrations);
    const client = providerConfigs.length > 0 ? new AIClient(providerConfigs) : getAIClient();

    // --- Model Routing ---
    const routing = routeModel(prompt, { explicitModel: model, paperCount });
    logRoutingDecision(routing, prompt.length);

    const provider = providerType
        ? client.getProvider(providerType)
        : client.getProvider(routing.provider as AIProviderType) || client.getProvider();
    
    if (!provider) {
        throw new Error(`AI provider ${providerType || routing.provider} not configured`);
    }

    const messages: AIMessage[] = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const actualModel = model || routing.model;
    
    const response = await provider.call({
        model: actualModel,
        messages,
        temperature: 0.7,
        maxTokens: 8192,
    });

    logLlmCall(provider.provider, actualModel, prompt.length, response.content.length, 0, true).catch(() => {});

    return response.content;
}

const callAI = createCachedCallAI(callAIDirect as any);

async function logLlmCall(
    operation: string, model: string,
    inputLen: number, outputLen: number,
    durationMs: number, success: boolean,
    userId?: string, error?: string
): Promise<void> {
    try {
        await query(
            `INSERT INTO llm_call_logs (user_id, operation, model, input_tokens, output_tokens, duration_ms, success, error)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [userId || null, operation, model,
            Math.ceil(inputLen / 4), Math.ceil(outputLen / 4),
                durationMs, success, error || null]
        );
    } catch {
        // Don't fail on logging errors
    }
}

// ============================================================================
// POST /ai/scrape — Scrape paper via Firecrawl
// ============================================================================

const ScrapeSchema = z.object({
    url: z.string().url(),
});

router.post('/scrape', requireAuth, requireFeature('ai_assistant'), checkUsageLimit('apiCallsPerDay'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = ScrapeSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Invalid URL', details: parsed.error.issues });
            return;
        }

        const { url } = parsed.data;

        const firecrawlApiKey = await getFirecrawlApiKey(req.user!.userId);

        if (!firecrawlApiKey) {
            res.status(503).json({ error: 'Firecrawl API key not configured' });
            return;
        }

        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${firecrawlApiKey}`,
            },
            body: JSON.stringify({ url, formats: ['markdown'] }),
        });

        if (!response.ok) {
            const error: any = await response.json().catch(() => ({}));
            res.status(response.status).json({ error: error.message || 'Firecrawl API error' });
            return;
        }

        const result: any = await response.json();

        if (!result.success) {
            res.status(500).json({ error: result.error || 'Failed to scrape URL' });
            return;
        }

        const data = result.data || {};
        const title = data.metadata?.title || extractTitleFromContent(data.markdown || '') || url;
        const { venue, year } = detectVenueAndYear(url, data.markdown || '');

        // Log usage
        await query(
            `UPDATE usage_records SET api_calls = api_calls + 1, last_updated = NOW()
             WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()`,
            [req.user!.userId]
        ).catch(() => { });

        res.json({
            url,
            title,
            content: data.markdown || '',
            venue,
            year,
        });
    } catch (error) {
        console.error('[AI] Scrape error:', error);
        res.status(500).json({ error: 'Failed to scrape URL' });
    }
});

// ============================================================================
// POST /ai/analyze-gaps — Extract research gaps from content
// ============================================================================

const AnalyzeSchema = z.object({
    content: z.string().min(10).max(500000),
});

router.post('/analyze-gaps', requireAuth, requireFeature('ai_assistant'), checkUsageLimit('apiCallsPerDay'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = AnalyzeSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { content } = parsed.data;

        if (!config.geminiApiKey) {
            res.status(503).json({ error: 'Gemini API key not configured' });
            return;
        }

        const prompt = `You are a meta-research analyst specializing in AI and scientific discovery. Analyze the following academic paper content to extract deep insights.

For each research gap or limitation found, provide:
1. problem: A clear description.
2. type: Choose one: "data", "compute", "evaluation", "theory", "deployment", or "methodology".
3. confidence: Score 0 to 1.
4. impactScore: "low", "medium", or "high".
5. difficulty: "low", "medium", or "high".
6. assumptions: List hidden assumptions the authors made.
7. failures: List specific approaches the authors mentioned failed.
8. datasetGaps: List if they mention missing or inadequate datasets.
9. evaluationCritique: Brief critique of the metrics they used.

Return your response as a JSON array.

Paper content:
${content.slice(0, 18000)}

Return ONLY valid JSON array.`;

        const text = await callAI(prompt, undefined, undefined, undefined, req.user!.userId);

        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            res.json({ gaps: [] });
            return;
        }

        const rawGaps = JSON.parse(jsonMatch[0]);

        const gaps = rawGaps.map((gap: any, index: number) => ({
            id: `gap-${Date.now()}-${index}`,
            problem: gap.problem || '',
            type: gap.type || 'methodology',
            confidence: Math.min(1, Math.max(0, gap.confidence || 0.5)),
            impactScore: gap.impactScore || 'medium',
            difficulty: gap.difficulty || 'medium',
            assumptions: gap.assumptions || [],
            failures: gap.failures || [],
            datasetGaps: gap.datasetGaps || [],
            evaluationCritique: gap.evaluationCritique || '',
        }));

        // Track usage
        await query(
            `UPDATE usage_records SET api_calls = api_calls + 1, last_updated = NOW()
             WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()`,
            [req.user!.userId]
        ).catch(() => { });

        res.json({ gaps });
    } catch (error) {
        console.error('[AI] Analyze gaps error:', error);
        res.status(500).json({ error: 'Failed to analyze content' });
    }
});

// ============================================================================
// POST /ai/chat — Chat with papers
// ============================================================================

const ChatSchema = z.object({
    prompt: z.string().min(1).max(10000),
    papers: z.array(z.object({
        title: z.string(),
        content: z.string(),
    })).optional(),
    history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
    })).optional(),
});

router.post('/chat', requireAuth, requireFeature('ai_assistant'), checkUsageLimit('apiCallsPerDay'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = ChatSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { prompt, papers, history } = parsed.data;

        let context = '';
        if (papers && papers.length > 0) {
            context = papers.map(p => `### ${p.title}\n${p.content.slice(0, 5000)}`).join('\n\n---\n\n');
        }

        let conversationHistory = '';
        if (history && history.length > 0) {
            conversationHistory = history.map(m => `${m.role}: ${m.content}`).join('\n');
        }

        const fullPrompt = `You are a research assistant helping analyze academic papers.

${context ? `Context from papers:\n${context}\n\n` : ''}
${conversationHistory ? `Previous conversation:\n${conversationHistory}\n\n` : ''}
User question: ${prompt}

Provide a helpful, accurate, and detailed response.`;

        const text = await callAI(fullPrompt, undefined, undefined, undefined, req.user!.userId);

        await query(
            `UPDATE usage_records SET api_calls = api_calls + 1, last_updated = NOW()
             WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()`,
            [req.user!.userId]
        ).catch(() => { });

        res.json({ response: text });
    } catch (error) {
        console.error('[AI] Chat error:', error);
        res.status(500).json({ error: 'Failed to process chat' });
    }
});

// ============================================================================
// POST /ai/explain-unsolved — Explain unsolved problems
// ============================================================================

router.post('/explain-unsolved', requireAuth, requireFeature('ai_assistant'), checkUsageLimit('apiCallsPerDay'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            res.status(400).json({ error: 'Prompt is required' });
            return;
        }

        const fullPrompt = `You are a research scientist. Explain why the following problem remains unsolved in AI/ML research. Be specific about the technical barriers, failed approaches, and what would constitute a breakthrough.

Problem: ${prompt}

Provide a detailed, technical explanation.`;

        const text = await callAI(fullPrompt, undefined, undefined, undefined, req.user!.userId);
        res.json({ explanation: text });
    } catch (error) {
        console.error('[AI] Explain error:', error);
        res.status(500).json({ error: 'Failed to explain problem' });
    }
});

// ============================================================================
// POST /ai/generate-proposal — Generate research proposal
// ============================================================================

router.post('/generate-proposal', requireAuth, requireFeature('ai_assistant'), checkUsageLimit('apiCallsPerDay'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { gap } = req.body;
        if (!gap) {
            res.status(400).json({ error: 'Gap description is required' });
            return;
        }

        const fullPrompt = `You are a senior research scientist. Generate a detailed research proposal to address the following research gap.

Research Gap: ${gap}

Provide the response as a JSON object with these fields:
- title: Proposed research title
- abstract: 200-word abstract
- motivation: Why this matters
- methodology: Detailed approach
- timeline: Estimated phases and duration
- expectedOutcomes: List of expected results
- resources: Required resources and tools

Return ONLY valid JSON.`;

        const text = await callAI(fullPrompt, undefined, undefined, undefined, req.user!.userId);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            res.status(500).json({ error: 'Failed to generate proposal' });
            return;
        }

        const proposal = JSON.parse(jsonMatch[0]);
        res.json(proposal);
    } catch (error) {
        console.error('[AI] Proposal error:', error);
        res.status(500).json({ error: 'Failed to generate proposal' });
    }
});

// ============================================================================
// POST /ai/compare-papers — Compare multiple papers
// ============================================================================

router.post('/compare-papers', requireAuth, requireFeature('ai_assistant'), checkUsageLimit('apiCallsPerDay'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { papers } = req.body;
        if (!papers || papers.length < 2) {
            res.status(400).json({ error: 'At least 2 papers are required' });
            return;
        }

        const papersContext = papers.map((p: any, i: number) =>
            `Paper ${i + 1}: ${p.title}\n${(p.content || '').slice(0, 5000)}`
        ).join('\n\n---\n\n');

        const fullPrompt = `Compare the following academic papers. Identify:
1. Common themes and approaches
2. Key differences in methodology
3. Contradicting findings
4. Complementary insights
5. Combined research gaps

${papersContext}

Provide a detailed, structured comparison.`;

        const text = await callAI(fullPrompt, undefined, undefined, undefined, req.user!.userId);
        res.json({ comparison: text });
    } catch (error) {
        console.error('[AI] Compare error:', error);
        res.status(500).json({ error: 'Failed to compare papers' });
    }
});

// ============================================================================
// POST /ai/generate-startup-idea
// ============================================================================

router.post('/generate-startup-idea', requireAuth, requireFeature('ai_assistant'), checkUsageLimit('apiCallsPerDay'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            res.status(400).json({ error: 'Prompt is required' });
            return;
        }

        const fullPrompt = `Based on this research gap, propose a startup idea. Return JSON with:
- idea: The startup concept
- audience: Target audience
- why_now: Why this is timely
- moat: Competitive advantage
- mvp: Minimum viable product description

Research gap: ${prompt}

Return ONLY valid JSON.`;

        const text = await callAI(fullPrompt, undefined, undefined, undefined, req.user!.userId);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            res.json(JSON.parse(jsonMatch[0]));
        } else {
            res.json({ idea: text, audience: '', why_now: '' });
        }
    } catch (error) {
        console.error('[AI] Startup idea error:', error);
        res.status(500).json({ error: 'Failed to generate startup idea' });
    }
});

// ============================================================================
// POST /ai/generate-research-questions
// ============================================================================

router.post('/generate-research-questions', requireAuth, requireFeature('ai_assistant'), checkUsageLimit('apiCallsPerDay'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            res.status(400).json({ error: 'Prompt is required' });
            return;
        }

        const fullPrompt = `Given this research gap, generate 5-7 specific, testable research questions that could address it. Each question should be actionable and lead to a concrete experiment or study.

Research gap: ${prompt}

Return a JSON array of strings (research questions only).`;

        const text = await callAI(fullPrompt, undefined, undefined, undefined, req.user!.userId);
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            res.json({ questions: JSON.parse(jsonMatch[0]) });
        } else {
            res.json({ questions: [text] });
        }
    } catch (error) {
        console.error('[AI] Research questions error:', error);
        res.status(500).json({ error: 'Failed to generate research questions' });
    }
});

// ============================================================================
// POST /ai/red-team-analysis
// ============================================================================

router.post('/red-team-analysis', requireAuth, requireFeature('ai_assistant'), checkUsageLimit('apiCallsPerDay'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { gap } = req.body;
        if (!gap) {
            res.status(400).json({ error: 'Gap description is required' });
            return;
        }

        const fullPrompt = `Red-team this research direction. For each potential failure mode, provide:
- failure_mode: What could go wrong
- likelihood: "low", "medium", or "high"
- severity: "low", "medium", or "high"
- mitigation: How to address it

Research direction: ${gap}

Return a JSON array of objects with these fields.`;

        const text = await callAI(fullPrompt, undefined, undefined, undefined, req.user!.userId);
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            res.json({ analysis: JSON.parse(jsonMatch[0]) });
        } else {
            res.json({ analysis: [] });
        }
    } catch (error) {
        console.error('[AI] Red team error:', error);
        res.status(500).json({ error: 'Failed to generate red team analysis' });
    }
});

// ============================================================================
// POST /ai/predict-impact
// ============================================================================

router.post('/predict-impact', requireAuth, requireFeature('impact_prediction'), checkUsageLimit('apiCallsPerDay'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { gap } = req.body;
        if (!gap) {
            res.status(400).json({ error: 'Gap description is required' });
            return;
        }

        const fullPrompt = `Predict the potential academic and industry impact of solving this research gap. Return JSON with:
- hype_score: 1-10 (how much buzz this topic has)
- reality_score: 1-10 (how practical the solution would be)
- predicted_citations: Range like "50-200"
- justification: Brief explanation
- timeline: Estimated years to significant impact

Research gap: ${gap}

Return ONLY valid JSON.`;

        const text = await callAI(fullPrompt, undefined, undefined, undefined, req.user!.userId);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            res.json(JSON.parse(jsonMatch[0]));
        } else {
            res.json({ hype_score: 5, reality_score: 5, predicted_citations: 'unknown', justification: text });
        }
    } catch (error) {
        console.error('[AI] Impact prediction error:', error);
        res.status(500).json({ error: 'Failed to predict impact' });
    }
});

// ============================================================================
// GET /ai/health — Health check
// ============================================================================

router.get('/health', (_req: Request, res: Response): void => {
    res.json({
        status: 'ok',
        geminiConfigured: !!config.geminiApiKey,
        firecrawlConfigured: !!config.firecrawlApiKey,
        llmCache: getCacheStats(),
        modelRouting: getRoutingStats(),
    });
});

// ============================================================================
// POST /ai/prompt — Generic Gemini proxy (used by frontend AI shim)
// ============================================================================

const PromptSchema = z.object({
    prompt: z.string().min(1).max(200_000),
    model: z.string().optional(),
    paperCount: z.number().int().min(0).max(50).optional(),
});

router.post('/prompt', requireAuth, requireFeature('ai_assistant'), checkUsageLimit('apiCallsPerDay'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = PromptSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
            return;
        }

        if (!config.geminiApiKey) {
            res.status(503).json({ error: 'Gemini API not configured on server' });
            return;
        }

        const { prompt, model, paperCount } = parsed.data;
        const text = await callAI(prompt, model, undefined, undefined, req.user!.userId, paperCount);

        await query(
            `UPDATE usage_records SET api_calls = api_calls + 1, last_updated = NOW()
             WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()`,
            [req.user!.userId]
        ).catch(() => { });

        res.json({ text });
    } catch (error: any) {
        console.error('[AI] Prompt error:', error);
        res.status(500).json({ error: error.message || 'AI service error' });
    }
});

// ============================================================================
// POST /ai/embeddings — Embedding generation proxy (used by frontend semantic search)
// ============================================================================

const EmbeddingsSchema = z.object({
    text: z.string().min(1).max(10000),
    model: z.string().optional(),
});

router.post('/embeddings', requireAuth, requireFeature('ai_assistant'), checkUsageLimit('apiCallsPerDay'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = EmbeddingsSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
            return;
        }

        if (!config.geminiApiKey) {
            res.status(503).json({ error: 'Gemini API not configured on server' });
            return;
        }

        const { text, model = 'text-embedding-004' } = parsed.data;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${config.geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: { parts: [{ text }] },
                    task_type: 'SEMANTIC_SIMILARITY',
                }),
            }
        );

        if (!response.ok) {
            const err: any = await response.json().catch(() => ({}));
            res.status(response.status).json({ error: err.error?.message || 'Embedding API error' });
            return;
        }

        const result: any = await response.json();
        const values: number[] = result.embedding?.values || [];

        await query(
            `UPDATE usage_records SET api_calls = api_calls + 1, last_updated = NOW()
             WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()`,
            [req.user!.userId]
        ).catch(() => { });

        res.json({ values, dimensions: values.length });
    } catch (error: any) {
        console.error('[AI] Embeddings error:', error);
        res.status(500).json({ error: error.message || 'Embeddings service error' });
    }
});

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

    // Detect venue from URL
    if (url.includes('arxiv.org')) venue = 'arXiv';
    else if (url.includes('openreview.net')) venue = 'OpenReview';
    else if (url.includes('aclanthology.org')) venue = 'ACL';
    else if (url.includes('neurips')) venue = 'NeurIPS';
    else if (url.includes('icml')) venue = 'ICML';
    else if (url.includes('iclr')) venue = 'ICLR';
    else if (url.includes('cvpr')) venue = 'CVPR';
    else if (url.includes('aaai')) venue = 'AAAI';

    // Detect year from URL or content
    const yearMatch = url.match(/20[12]\d/) || content.slice(0, 2000).match(/20[12]\d/);
    if (yearMatch) year = yearMatch[0];

    return { venue, year };
}

export default router;
