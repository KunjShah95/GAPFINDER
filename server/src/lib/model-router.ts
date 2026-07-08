// ============================================================================
// Model Router
// Classifies prompt complexity and routes to the optimal model
// Pure heuristic — no ML dependencies, <5ms per classification
// ============================================================================

export type ComplexityLevel = 'simple' | 'medium' | 'complex';

export interface RoutingDecision {
    level: ComplexityLevel;
    model: string;
    provider: string;
    reason: string;
    estimatedCostFactor: number; // relative cost vs cheapest model
}

export interface RoutingOptions {
    explicitModel?: string;
    paperCount?: number;
    providerHints?: string[];
}

// ============================================================================
// COMPLEXITY CLASSIFICATION KEYWORDS
// ============================================================================

const COMPLEX_KEYWORDS = [
    'compare', 'comparison', 'contrast', 'versus', 'vs',
    'synthesize', 'synthesis', 'combine', 'integrate',
    'multiple papers', 'multiple studies', 'cross-paper',
    'red-team', 'red team', 'adversarial', 'critique',
    'meta-analysis', 'systematic review', 'literature review',
    'multi-document', 'cross-study', 'across papers',
    'debate', 'evaluate conflicting', 'contradict',
    'comprehensive analysis', 'deep dive', 'holistic',
    'trade-offs', 'tradeoffs', 'pros and cons',
];

const SIMPLE_KEYWORDS = [
    'classify', 'categorize', 'tag', 'label',
    'extract', 'pull out', 'list', 'enumerate',
    'title', 'name', 'date', 'author',
    'yes or no', 'true or false', 'boolean',
    'count', 'how many', 'how much',
    'define', 'what is', 'what are',
    'format', 'convert', 'reformat',
    'rename', 'shorten', 'summarize briefly',
    'bullet', 'one-liner', 'brief',
];

const MEDIUM_KEYWORDS = [
    'summarize', 'summary', 'overview',
    'explain', 'describe',
    'analyze', 'analysis',
    'identify', 'find', 'discover',
    'suggest', 'recommend', 'propose',
    'generate', 'create', 'write',
    'research gap', 'gap analysis',
    'impact', 'significance', 'importance',
];

// ============================================================================
// PAPER REFERENCE DETECTION
// ============================================================================

function countPaperReferences(prompt: string): number {
    let count = 0;

    // Count arXiv IDs
    const arxivMatches = prompt.match(/arxiv:\s?\d{4}\.\d{4,5}/gi);
    count += arxivMatches?.length || 0;

    // Count DOI references
    const doiMatches = prompt.match(/doi:\s?10\.\d{4,}/gi);
    count += doiMatches?.length || 0;

    // Count "Paper N:" or "Study N:" references
    const paperLabels = prompt.match(/(?:paper|study|article|research)\s+\d+/gi);
    count += paperLabels?.length || 0;

    return count;
}

// ============================================================================
// COMPLEXITY SCORING
// ============================================================================

function classifyComplexity(prompt: string, options?: RoutingOptions): {
    level: ComplexityLevel;
    reason: string;
    score: number;
} {
    const lowerPrompt = prompt.toLowerCase();
    const promptLen = prompt.length;

    // Check for explicit paper count override
    const paperCount = options?.paperCount ?? countPaperReferences(prompt);

    let score = 50; // base score (medium)

    // --- Prompt length signal ---
    if (promptLen < 200) score -= 8;
    else if (promptLen > 15000) score += 25;
    else if (promptLen > 5000) score += 15;

    // --- Keyword signals ---
    let complexHits = 0;
    for (const kw of COMPLEX_KEYWORDS) {
        if (lowerPrompt.includes(kw)) complexHits++;
    }
    score += complexHits * 15;

    let simpleHits = 0;
    for (const kw of SIMPLE_KEYWORDS) {
        if (lowerPrompt.includes(kw)) simpleHits++;
    }
    score -= simpleHits * 10;

    let mediumHits = 0;
    for (const kw of MEDIUM_KEYWORDS) {
        if (lowerPrompt.includes(kw)) mediumHits++;
    }
    score += mediumHits * 3;

    // --- Paper count signal ---
    if (paperCount >= 3) score += 35;
    else if (paperCount === 2) score += 20;
    else if (paperCount === 0) score -= 5;

    // --- JSON array in context (multi-item output = harder task) ---
    if (lowerPrompt.includes('json array') || lowerPrompt.includes('return a json array')) {
        score += 5;
    }

    // --- Structural complexity (lists, numbered items) ---
    const numberedItems = prompt.match(/^\d+[\.\)]\s/gm);
    if (numberedItems && numberedItems.length > 5) score += 8;

    // --- Determine level ---
    if (score >= 70) {
        return { level: 'complex', reason: buildReason('complex', complexHits, simpleHits, paperCount, promptLen), score };
    } else if (score <= 35) {
        return { level: 'simple', reason: buildReason('simple', complexHits, simpleHits, paperCount, promptLen), score };
    }
    return { level: 'medium', reason: buildReason('medium', complexHits, simpleHits, paperCount, promptLen), score };
}

function buildReason(level: ComplexityLevel, complexHits: number, simpleHits: number, paperCount: number, promptLen: number): string {
    const parts: string[] = [];
    if (complexHits > 0) parts.push(`${complexHits} complex keyword(s)`);
    if (simpleHits > 0) parts.push(`${simpleHits} simple keyword(s)`);
    if (paperCount > 1) parts.push(`${paperCount} papers detected`);
    if (promptLen > 5000) parts.push(`long prompt (${promptLen} chars)`);
    if (promptLen < 200) parts.push(`short prompt (${promptLen} chars)`);
    return parts.length > 0 ? parts.join(', ') : `score-based (${level})`;
}

// ============================================================================
// MODEL SELECTION TABLE
// ============================================================================

const MODEL_TABLE: Record<ComplexityLevel, { model: string; provider: string; costFactor: number }> = {
    simple: {
        model: 'gemini-2.0-flash',
        provider: 'gemini',
        costFactor: 0.15,  // ~15% of pro cost
    },
    medium: {
        model: 'gpt-4o-mini',
        provider: 'openai',
        costFactor: 0.35,  // ~35% of pro cost
    },
    complex: {
        model: 'gemini-2.0-pro',
        provider: 'gemini',
        costFactor: 1.0,   // baseline
    },
};

// Fallback models if primary is unavailable
const FALLBACK_TABLE: Record<ComplexityLevel, { model: string; provider: string }[]> = {
    simple: [
        { model: 'gpt-4o-mini', provider: 'openai' },
        { model: 'gemini-2.0-flash-lite', provider: 'gemini' },
    ],
    medium: [
        { model: 'gemini-2.0-flash', provider: 'gemini' },
        { model: 'gpt-4o-mini', provider: 'openai' },
    ],
    complex: [
        { model: 'claude-3.5-sonnet-20241022', provider: 'anthropic' },
        { model: 'gpt-4o', provider: 'openai' },
    ],
};

// ============================================================================
// MAIN ROUTING FUNCTION
// ============================================================================

export function routeModel(
    prompt: string,
    options?: RoutingOptions
): RoutingDecision {
    // --- Override: explicit model selection ---
    if (options?.explicitModel) {
        return {
            level: 'medium', // unknown when overridden
            model: options.explicitModel,
            provider: detectProvider(options.explicitModel),
            reason: 'explicit model override',
            estimatedCostFactor: 0.5, // unknown cost
        };
    }

    const { level, reason } = classifyComplexity(prompt, options);
    const selected = MODEL_TABLE[level];

    return {
        level,
        model: selected.model,
        provider: selected.provider,
        reason,
        estimatedCostFactor: selected.costFactor,
    };
}

function detectProvider(model: string): string {
    if (model.startsWith('gemini')) return 'gemini';
    if (model.startsWith('gpt')) return 'openai';
    if (model.startsWith('claude')) return 'anthropic';
    if (model.startsWith('deepseek')) return 'deepseek';
    if (model.startsWith('mistral')) return 'mistral';
    if (model.startsWith('command')) return 'cohere';
    return 'gemini'; // default
}

// ============================================================================
// COST LOGGING
// ============================================================================

export interface RoutingLogEntry {
    timestamp: Date;
    level: ComplexityLevel;
    model: string;
    provider: string;
    promptLength: number;
    estimatedCostFactor: number;
    reason: string;
}

const routingLogs: RoutingLogEntry[] = [];
const MAX_LOG_SIZE = 1000;

export function logRoutingDecision(decision: RoutingDecision, promptLength: number): void {
    const entry: RoutingLogEntry = {
        timestamp: new Date(),
        level: decision.level,
        model: decision.model,
        provider: decision.provider,
        promptLength,
        estimatedCostFactor: decision.estimatedCostFactor,
        reason: decision.reason,
    };

    routingLogs.push(entry);
    if (routingLogs.length > MAX_LOG_SIZE) {
        routingLogs.splice(0, routingLogs.length - MAX_LOG_SIZE);
    }

    console.log(
        `[ModelRouter] ${decision.level.toUpperCase()} → ${decision.model} ` +
        `(${decision.provider}) | cost=${decision.estimatedCostFactor.toFixed(2)} | ${decision.reason}`
    );
}

export function getRoutingStats(): {
    total: number;
    byLevel: Record<ComplexityLevel, number>;
    avgCostFactor: number;
    estimatedSavings: number;
} {
    const byLevel: Record<ComplexityLevel, number> = { simple: 0, medium: 0, complex: 0 };
    let totalCost = 0;

    for (const entry of routingLogs) {
        byLevel[entry.level]++;
        totalCost += entry.estimatedCostFactor;
    }

    const total = routingLogs.length;
    const avgCostFactor = total > 0 ? totalCost / total : 0;

    // Savings = difference between always using pro (1.0) vs actual routing
    const estimatedSavings = total > 0 ? (1 - avgCostFactor) * 100 : 0;

    return { total, byLevel, avgCostFactor, estimatedSavings };
}

export function clearRoutingLogs(): void {
    routingLogs.length = 0;
}
