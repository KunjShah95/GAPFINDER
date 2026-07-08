import { config } from '../config.js';

// ============================================================================
// AI PROVIDER ABSTRACTION FOR WORKER
// ============================================================================

interface AIProvider {
    call(params: {
        model: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        temperature?: number;
        maxTokens?: number;
    }): Promise<{ content: string }>;
}

class GeminiProvider implements AIProvider {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async call(params: {
        model: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        temperature?: number;
        maxTokens?: number;
    }): Promise<{ content: string }> {
        const response = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.apiKey,
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [{ text: params.messages[params.messages.length - 1].content }],
                        },
                    ],
                    generationConfig: {
                        temperature: params.temperature || 0.7,
                        maxOutputTokens: params.maxTokens || 8192,
                    },
                }),
            }
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const result: any = await response.json();
        const content = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!content) {
            throw new Error('Gemini returned empty response');
        }

        return { content };
    }
}

class OpenAIProvider implements AIProvider {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async call(params: {
        model: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        temperature?: number;
        maxTokens?: number;
    }): Promise<{ content: string }> {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: params.model || 'gpt-4-turbo',
                messages: params.messages,
                temperature: params.temperature || 0.7,
                max_tokens: params.maxTokens || 8192,
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const result: any = await response.json();
        const content = result.choices?.[0]?.message?.content || '';

        if (!content) {
            throw new Error('OpenAI returned empty response');
        }

        return { content };
    }
}

class AnthropicProvider implements AIProvider {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async call(params: {
        model: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        temperature?: number;
        maxTokens?: number;
    }): Promise<{ content: string }> {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: params.model || 'claude-opus',
                messages: params.messages,
                max_tokens: params.maxTokens || 8192,
                temperature: params.temperature || 0.7,
            }),
        });

        if (!response.ok) {
            throw new Error(`Anthropic API error: ${response.status}`);
        }

        const result: any = await response.json();
        const content = result.content?.[0]?.text || '';

        if (!content) {
            throw new Error('Anthropic returned empty response');
        }

        return { content };
    }
}

class AIClient {
    private provider: AIProvider | null = null;

    constructor() {
        // Try to initialize with available provider (priority order)
        if (config.geminiApiKey) {
            this.provider = new GeminiProvider(config.geminiApiKey);
        } else if (config.openaiApiKey) {
            this.provider = new OpenAIProvider(config.openaiApiKey);
        } else if (config.anthropicApiKey) {
            this.provider = new AnthropicProvider(config.anthropicApiKey);
        }
    }

    getProvider(): AIProvider | null {
        return this.provider;
    }

    async call(params: {
        model: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        temperature?: number;
        maxTokens?: number;
    }): Promise<{ content: string }> {
        if (!this.provider) {
            throw new Error('No AI provider configured');
        }
        return this.provider.call(params);
    }
}

const aiClient = new AIClient();

export function getAIClient(): AIClient {
    return aiClient;
}
