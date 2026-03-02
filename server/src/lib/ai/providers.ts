// ============================================================================
// AI Provider System
// Unified interface for multiple LLM providers
// Supports: OpenAI, Anthropic, Google Gemini, OpenRouter, and more
// ============================================================================

export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AIRequest {
    model: string;
    messages: AIMessage[];
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
}

export interface AIResponse {
    content: string;
    model: string;
    provider: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
}

export interface AIProvider {
    name: string;
    provider: string;
    call(request: AIRequest): Promise<AIResponse>;
    listModels(): string[];
}

export type AIProviderType = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'deepseek' | 'mistral' | 'cohere';

export interface ProviderConfig {
    type: AIProviderType;
    apiKey: string;
    baseUrl?: string;
}

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.7;

function safeJsonParse<T>(json: unknown, fallback: T): T {
    if (typeof json !== 'object' || json === null) return fallback;
    return json as T;
}

// ============================================================================
// OPENAI PROVIDER
// ============================================================================

export class OpenAIProvider implements AIProvider {
    name = 'OpenAI';
    provider = 'openai';
    private apiKey: string;
    private baseUrl: string;

    constructor(config: ProviderConfig) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    }

    async call(request: AIRequest): Promise<AIResponse> {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: request.model,
                messages: request.messages,
                temperature: request.temperature ?? DEFAULT_TEMPERATURE,
                max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
            }),
        });

        if (!response.ok) {
            const errorBody = safeJsonParse(await response.json().catch(() => ({})), { error: { message: '' } });
            throw new Error((errorBody as { error?: { message?: string } }).error?.message || `OpenAI API error: ${response.status}`);
        }

        const result = safeJsonParse(await response.json(), { choices: [], usage: {} }) as {
            choices?: { message?: { content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        return {
            content: result.choices?.[0]?.message?.content || '',
            model: request.model,
            provider: this.provider,
            usage: {
                inputTokens: result.usage?.prompt_tokens || 0,
                outputTokens: result.usage?.completion_tokens || 0,
            },
        };
    }

    listModels(): string[] {
        return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
    }
}

// ============================================================================
// ANTHROPIC PROVIDER (Claude)
// ============================================================================

export class AnthropicProvider implements AIProvider {
    name = 'Anthropic';
    provider = 'anthropic';
    private apiKey: string;
    private baseUrl: string;

    constructor(config: ProviderConfig) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
    }

    async call(request: AIRequest): Promise<AIResponse> {
        const systemMessage = request.messages.find(m => m.role === 'system');
        const otherMessages = request.messages.filter(m => m.role !== 'system');

        const response = await fetch(`${this.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: request.model,
                system: systemMessage?.content,
                messages: otherMessages.map(m => ({ role: m.role, content: m.content })),
                temperature: request.temperature ?? DEFAULT_TEMPERATURE,
                max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
            }),
        });

        if (!response.ok) {
            const errorBody = safeJsonParse(await response.json().catch(() => ({})), { error: { message: '' } });
            throw new Error((errorBody as { error?: { message?: string } }).error?.message || `Anthropic API error: ${response.status}`);
        }

        const result = safeJsonParse(await response.json(), { content: [], usage: {} }) as {
            content?: { text?: string }[];
            usage?: { input_tokens?: number; output_tokens?: number };
        };

        return {
            content: result.content?.[0]?.text || '',
            model: request.model,
            provider: this.provider,
            usage: {
                inputTokens: result.usage?.input_tokens || 0,
                outputTokens: result.usage?.output_tokens || 0,
            },
        };
    }

    listModels(): string[] {
        return ['claude-sonnet-4-20250514', 'claude-3.5-sonnet-20241022', 'claude-3.5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'];
    }
}

// ============================================================================
// GOOGLE GEMINI PROVIDER
// ============================================================================

export class GeminiProvider implements AIProvider {
    name = 'Google Gemini';
    provider = 'gemini';
    private apiKey: string;
    private baseUrl: string;

    constructor(config: ProviderConfig) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    }

    async call(request: AIRequest): Promise<AIResponse> {
        const contents = request.messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

        const response = await fetch(
            `${this.baseUrl}/models/${request.model}:generateContent?key=${this.apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        temperature: request.temperature ?? DEFAULT_TEMPERATURE,
                        maxOutputTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
                    },
                }),
            }
        );

        if (!response.ok) {
            const errorBody = safeJsonParse(await response.json().catch(() => ({})), { error: { message: '' } });
            throw new Error((errorBody as { error?: { message?: string } }).error?.message || `Gemini API error: ${response.status}`);
        }

        const result = safeJsonParse(await response.json(), { candidates: [] });
        const candidates = (result as { candidates?: unknown[] }).candidates;
        const firstCandidate = Array.isArray(candidates) ? candidates[0] : undefined;
        const content = typeof firstCandidate === 'object' && firstCandidate !== null 
            ? (firstCandidate as { content?: unknown }).content 
            : undefined;
        const parts = Array.isArray(content) ? content[0] : undefined;
        const text = typeof parts === 'object' && parts !== null 
            ? (parts as { text?: string }).text 
            : '';

        return {
            content: text || '',
            model: request.model,
            provider: this.provider,
        };
    }

    listModels(): string[] {
        return ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
    }
}

// ============================================================================
// OPENROUTER PROVIDER
// ============================================================================

export class OpenRouterProvider implements AIProvider {
    name = 'OpenRouter';
    provider = 'openrouter';
    private apiKey: string;
    private baseUrl: string;

    constructor(config: ProviderConfig) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
    }

    async call(request: AIRequest): Promise<AIResponse> {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
                'HTTP-Referer': 'https://gapminer.ai',
                'X-Title': 'GapMiner',
            },
            body: JSON.stringify({
                model: request.model,
                messages: request.messages,
                temperature: request.temperature ?? DEFAULT_TEMPERATURE,
                max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
            }),
        });

        if (!response.ok) {
            const errorBody = safeJsonParse(await response.json().catch(() => ({})), { error: { message: '' } });
            throw new Error((errorBody as { error?: { message?: string } }).error?.message || `OpenRouter API error: ${response.status}`);
        }

        const result = safeJsonParse(await response.json(), { choices: [], usage: {} }) as {
            choices?: { message?: { content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        return {
            content: result.choices?.[0]?.message?.content || '',
            model: request.model,
            provider: this.provider,
            usage: {
                inputTokens: result.usage?.prompt_tokens || 0,
                outputTokens: result.usage?.completion_tokens || 0,
            },
        };
    }

    listModels(): string[] {
        return [
            'openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/gpt-4-turbo',
            'anthropic/claude-sonnet-4-20250514', 'anthropic/claude-3.5-sonnet-20241022',
            'google/gemini-pro-1.5', 'google/gemini-flash-1.5-8b',
            'meta-llama/llama-3.1-405b-instruct', 'meta-llama/llama-3.1-70b-instruct',
            'mistralai/mistral-large', 'mistralai/mistral-7b-instruct',
            'deepseek/deepseek-chat', 'deepseek/deepseek-coder',
            'cohere/command-r-plus', 'cohere/command-r',
        ];
    }
}

// ============================================================================
// DEEPSEEK PROVIDER
// ============================================================================

export class DeepSeekProvider implements AIProvider {
    name = 'DeepSeek';
    provider = 'deepseek';
    private apiKey: string;
    private baseUrl: string;

    constructor(config: ProviderConfig) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.deepseek.com/v1';
    }

    async call(request: AIRequest): Promise<AIResponse> {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: request.model,
                messages: request.messages,
                temperature: request.temperature ?? DEFAULT_TEMPERATURE,
                max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
            }),
        });

        if (!response.ok) {
            const errorBody = safeJsonParse(await response.json().catch(() => ({})), { error: { message: '' } });
            throw new Error((errorBody as { error?: { message?: string } }).error?.message || `DeepSeek API error: ${response.status}`);
        }

        const result = safeJsonParse(await response.json(), { choices: [], usage: {} }) as {
            choices?: { message?: { content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        return {
            content: result.choices?.[0]?.message?.content || '',
            model: request.model,
            provider: this.provider,
            usage: {
                inputTokens: result.usage?.prompt_tokens || 0,
                outputTokens: result.usage?.completion_tokens || 0,
            },
        };
    }

    listModels(): string[] {
        return ['deepseek-chat', 'deepseek-coder'];
    }
}

// ============================================================================
// MISTRAL PROVIDER
// ============================================================================

export class MistralProvider implements AIProvider {
    name = 'Mistral AI';
    provider = 'mistral';
    private apiKey: string;
    private baseUrl: string;

    constructor(config: ProviderConfig) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.mistral.ai/v1';
    }

    async call(request: AIRequest): Promise<AIResponse> {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: request.model,
                messages: request.messages,
                temperature: request.temperature ?? DEFAULT_TEMPERATURE,
                max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
            }),
        });

        if (!response.ok) {
            const errorBody = safeJsonParse(await response.json().catch(() => ({})), { error: { message: '' } });
            throw new Error((errorBody as { error?: { message?: string } }).error?.message || `Mistral API error: ${response.status}`);
        }

        const result = safeJsonParse(await response.json(), { choices: [], usage: {} }) as {
            choices?: { message?: { content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        return {
            content: result.choices?.[0]?.message?.content || '',
            model: request.model,
            provider: this.provider,
            usage: {
                inputTokens: result.usage?.prompt_tokens || 0,
                outputTokens: result.usage?.completion_tokens || 0,
            },
        };
    }

    listModels(): string[] {
        return ['mistral-large-latest', 'mistral-small-latest', 'mistral-medium-latest', 'mistral-tiny'];
    }
}

// ============================================================================
// COHERE PROVIDER
// ============================================================================

export class CohereProvider implements AIProvider {
    name = 'Cohere';
    provider = 'cohere';
    private apiKey: string;
    private baseUrl: string;

    constructor(config: ProviderConfig) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.cohere.ai/v1';
    }

    async call(request: AIRequest): Promise<AIResponse> {
        const response = await fetch(`${this.baseUrl}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: request.model,
                message: request.messages[request.messages.length - 1]?.content || '',
                chat_history: request.messages.slice(0, -1).map(m => ({ role: m.role, message: m.content })),
                temperature: request.temperature ?? DEFAULT_TEMPERATURE,
                max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
            }),
        });

        if (!response.ok) {
            const errorBody = safeJsonParse(await response.json().catch(() => ({})), { error: { message: '' } });
            throw new Error((errorBody as { error?: { message?: string } }).error?.message || `Cohere API error: ${response.status}`);
        }

        const result = safeJsonParse(await response.json(), { text: '' }) as { text?: string };

        return {
            content: result.text || '',
            model: request.model,
            provider: this.provider,
        };
    }

    listModels(): string[] {
        return ['command-r-plus', 'command-r', 'command', 'c4ai-Command-R-plus'];
    }
}

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

export function createProvider(type: AIProviderType, apiKey: string, baseUrl?: string): AIProvider {
    const config: ProviderConfig = { type, apiKey, baseUrl };
    switch (type) {
        case 'openai': return new OpenAIProvider(config);
        case 'anthropic': return new AnthropicProvider(config);
        case 'gemini': return new GeminiProvider(config);
        case 'openrouter': return new OpenRouterProvider(config);
        case 'deepseek': return new DeepSeekProvider(config);
        case 'mistral': return new MistralProvider(config);
        case 'cohere': return new CohereProvider(config);
        default: throw new Error(`Unknown AI provider type: ${type}`);
    }
}

// ============================================================================
// UNIFIED AI CLIENT
// ============================================================================

export class AIClient {
    private providers: Map<string, AIProvider> = new Map();
    private defaultProvider: AIProvider | null = null;

    constructor(configs: { type: AIProviderType; apiKey: string; baseUrl?: string; default?: boolean }[]) {
        for (const cfg of configs) {
            if (cfg.apiKey) {
                const provider = createProvider(cfg.type, cfg.apiKey, cfg.baseUrl);
                this.providers.set(cfg.type, provider);
                if (cfg.default) this.defaultProvider = provider;
            }
        }
    }

    async complete(request: AIRequest): Promise<AIResponse> {
        const provider = this.defaultProvider;
        if (!provider) throw new Error('No AI provider configured');
        return provider.call(request);
    }

    getProvider(type?: AIProviderType): AIProvider | null {
        if (type) return this.providers.get(type) || null;
        return this.defaultProvider;
    }

    hasProvider(type?: AIProviderType): boolean {
        if (type) return this.providers.has(type);
        return this.defaultProvider !== null;
    }

    listAllModels(): { provider: string; models: string[] }[] {
        return Array.from(this.providers.values()).map(p => ({ provider: p.provider, models: p.listModels() }));
    }

    getConfiguredProviders(): string[] {
        return Array.from(this.providers.keys());
    }
}
