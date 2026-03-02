// Typed Gemini Client Wrapper
// Abstracts common patterns: response parsing, error handling
// All calls are proxied through the secure backend — no API keys in the browser
import { apiRequest } from '@/lib/api-client'
import { z } from "zod"

// ============================================================================
// Configuration
// ============================================================================

// Backend proxy — all calls routed through /api/ai/prompt
async function _callBackend(prompt: string): Promise<string> {
    const result = await apiRequest<{ text: string }>('/ai/prompt', {
        method: 'POST',
        body: { prompt },
        timeout: 120_000,
    });
    return result.text || '';
}

// ============================================================================
// Custom Errors
// ============================================================================

export class GeminiConfigError extends Error {
    override name = "GeminiConfigError" as const

    constructor(message: string) {
        super(message)
    }
}

export class GeminiParseError extends Error {
    override name = "GeminiParseError" as const
    rawResponse?: string

    constructor(message: string, rawResponse?: string) {
        super(message)
        this.rawResponse = rawResponse
    }
}

export class GeminiApiError extends Error {
    override name = "GeminiApiError" as const
    causedBy?: unknown

    constructor(message: string, cause?: unknown) {
        super(message)
        this.causedBy = cause
    }
}

// ============================================================================
// Request/Response Types
// ============================================================================

interface GeminiRequestBase {
    prompt: string
    model?: string
    maxRetries?: number
}

interface GeminiJsonRequest<T> extends GeminiRequestBase {
    responseSchema: z.ZodSchema<T>
    responseType: "object"
}

interface GeminiArrayRequest<T> extends GeminiRequestBase {
    responseSchema: z.ZodSchema<T>
    responseType: "array"
}

interface GeminiTextRequest extends GeminiRequestBase {
    responseType: "text"
}

type GeminiRequest<T> = GeminiJsonRequest<T> | GeminiArrayRequest<T> | GeminiTextRequest

// ============================================================================
// Core Query Function
// ============================================================================

const DEFAULT_MODEL = "gemini-2.0-flash"
const DEFAULT_MAX_RETRIES = 1

/**
 * Query Gemini with structured response parsing and validation
 */
export async function queryGemini<T>(request: GeminiJsonRequest<T>): Promise<T>
export async function queryGemini<T>(request: GeminiArrayRequest<T>): Promise<T[]>
export async function queryGemini(request: GeminiTextRequest): Promise<string>
export async function queryGemini<T>(request: GeminiRequest<T>): Promise<T | T[] | string> {
    const {
        prompt,
        model = DEFAULT_MODEL,
        maxRetries = DEFAULT_MAX_RETRIES,
        responseType
    } = request

    let lastError: unknown

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const text = await _callBackend(prompt)

            if (responseType === "text") {
                return text
            }

            // Parse structured response
            const pattern = responseType === "array" ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/
            const match = text.match(pattern)

            if (!match) {
                throw new GeminiParseError(
                    `No ${responseType === "array" ? "array" : "object"} found in response`,
                    text
                )
            }

            const parsed = JSON.parse(match[0])

            if (responseType === "array") {
                const arrayRequest = request as GeminiArrayRequest<T>
                return z.array(arrayRequest.responseSchema).parse(parsed)
            } else {
                const objectRequest = request as GeminiJsonRequest<T>
                return objectRequest.responseSchema.parse(parsed)
            }
        } catch (error) {
            lastError = error

            // Don't retry on config/parse errors
            if (error instanceof GeminiConfigError || error instanceof z.ZodError) {
                throw error
            }

            // Log and retry on other errors
            console.warn(`Gemini request failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error)
        }
    }

    throw new GeminiApiError(
        "All Gemini request attempts failed",
        lastError
    )
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Query Gemini for a JSON object response with Zod validation
 */
export async function queryGeminiObject<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: { model?: string; maxRetries?: number }
): Promise<T> {
    return queryGemini({
        prompt,
        responseSchema: schema,
        responseType: "object",
        ...options
    })
}

/**
 * Query Gemini for a JSON array response with Zod validation
 */
export async function queryGeminiArray<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: { model?: string; maxRetries?: number }
): Promise<T[]> {
    return queryGemini({
        prompt,
        responseSchema: schema,
        responseType: "array",
        ...options
    })
}

/**
 * Query Gemini for a plain text response
 */
export async function queryGeminiText(
    prompt: string,
    options?: { model?: string; maxRetries?: number }
): Promise<string> {
    return queryGemini({
        prompt,
        responseType: "text",
        ...options
    })
}

// ============================================================================
// Chat Session Support
// ============================================================================

interface ChatMessage {
    role: "user" | "assistant"
    content: string
}

/**
 * Query Gemini with chat history context
 */
export async function queryGeminiChat(
    query: string,
    history: ChatMessage[],
    systemInstruction: string
): Promise<string> {
    const genai = getGenAI()

    const contents = [
        ...history.map(m => ({
            role: m.role === "assistant" ? "model" as const : "user" as const,
            parts: [{ text: m.content }]
        })),
        {
            role: "user" as const,
            parts: [{ text: `System Instruction: ${systemInstruction}\n\nUser Query: ${query}` }]
        }
    ]

    const response = await genai.models.generateContent({
        model: DEFAULT_MODEL,
        contents,
    })

    return response.text || "I couldn't generate a response."
}

// ============================================================================
// Export the base instance for advanced usage
// ============================================================================

export { getGenAI }
