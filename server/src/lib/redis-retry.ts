/**
 * Redis Connection Retry & Exponential Backoff
 * 
 * Handles temporary Redis connection failures gracefully.
 * Uses exponential backoff to avoid overwhelming the server.
 */

export interface RetryConfig {
    maxRetries?: number;        // Maximum retry attempts (default: 3)
    initialDelayMs?: number;    // Initial delay in milliseconds (default: 100)
    maxDelayMs?: number;        // Maximum delay in milliseconds (default: 5000)
    backoffMultiplier?: number; // Exponential backoff multiplier (default: 2)
    jitterFraction?: number;    // Add random jitter 0-1 (default: 0.1)
}

interface RetryState {
    attempt: number;
    nextDelayMs: number;
}

export async function executeWithRetry<T>(
    operation: (attempt: number) => Promise<T>,
    config: RetryConfig = {}
): Promise<T> {
    const maxRetries = config.maxRetries ?? 3;
    const initialDelayMs = config.initialDelayMs ?? 100;
    const maxDelayMs = config.maxDelayMs ?? 5000;
    const backoffMultiplier = config.backoffMultiplier ?? 2;
    const jitterFraction = config.jitterFraction ?? 0.1;

    let lastError: Error | null = null;
    let nextDelayMs = initialDelayMs;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            return await operation(attempt);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt > maxRetries) {
                console.error(`[Retry] Failed after ${maxRetries} retries:`, lastError.message);
                throw lastError;
            }

            // Calculate delay with exponential backoff + jitter
            const jitter = nextDelayMs * jitterFraction * Math.random();
            const actualDelayMs = Math.min(nextDelayMs + jitter, maxDelayMs);

            console.warn(
                `[Retry] Attempt ${attempt} failed, ` +
                `retrying in ${Math.ceil(actualDelayMs)}ms: ${lastError.message}`
            );

            await sleep(actualDelayMs);
            nextDelayMs = Math.min(nextDelayMs * backoffMultiplier, maxDelayMs);
        }
    }

    throw lastError || new Error('Unknown error in executeWithRetry');
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry configuration presets
 */
export const RETRY_PRESETS = {
    AGGRESSIVE: {
        maxRetries: 5,
        initialDelayMs: 50,
        maxDelayMs: 2000,
        backoffMultiplier: 1.5,
        jitterFraction: 0.2,
    } as RetryConfig,

    STANDARD: {
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        jitterFraction: 0.1,
    } as RetryConfig,

    CONSERVATIVE: {
        maxRetries: 2,
        initialDelayMs: 500,
        maxDelayMs: 10000,
        backoffMultiplier: 3,
        jitterFraction: 0.05,
    } as RetryConfig,

    // For transient Redis connection failures
    REDIS_TRANSIENT: {
        maxRetries: 5,
        initialDelayMs: 50,
        maxDelayMs: 3000,
        backoffMultiplier: 1.5,
        jitterFraction: 0.15,
    } as RetryConfig,

    // For external API calls (Firecrawl, AI)
    EXTERNAL_API: {
        maxRetries: 3,
        initialDelayMs: 200,
        maxDelayMs: 8000,
        backoffMultiplier: 2.5,
        jitterFraction: 0.2,
    } as RetryConfig,
};
