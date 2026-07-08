// ============================================================================
// LLM Response Cache
// Cache-aside pattern for LLM API calls with semantic similarity matching
// Uses existing Redis client — no new connections
// ============================================================================

import { createHash } from 'crypto';
import { ensureRedisConnected, redisClient } from '../queues/redis.js';
import type { AIProviderType } from './ai/providers.js';

// ============================================================================
// Types
// ============================================================================

interface CacheEntry {
    content: string;
    model: string;
    provider: string;
    usage?: { inputTokens: number; outputTokens: number };
    cachedAt: number;
}

interface CacheStats {
    hits: number;
    misses: number;
    semanticHits: number;
    errors: number;
    totalSaved: number;
}

export interface CacheOptions {
    ttlSeconds?: number;
    similarityThreshold?: number;
}

// ============================================================================
// Config
// ============================================================================

const CACHE_PREFIX = 'llm:cache:';
const DEFAULT_TTL = 3600; // 1 hour
const DEFAULT_SIMILARITY_THRESHOLD = 0.85;

// In-memory stats (reset on restart, but useful for runtime monitoring)
const stats: CacheStats = {
    hits: 0,
    misses: 0,
    semanticHits: 0,
    errors: 0,
    totalSaved: 0,
};

// ============================================================================
// Text Normalization & Hashing
// ============================================================================

function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s\+\#\.]/g, ' ') // keep internal punctuation (+, #, .)
        .replace(/\s+/g, ' ')   // collapse whitespace
        .trim();
}

function sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
}

function buildExactKey(provider: string, model: string, systemPrompt: string, userMessage: string): string {
    const normalizedSystem = normalizeText(systemPrompt);
    const normalizedUser = normalizeText(userMessage);
    const payload = `${provider}:${model}:${normalizedSystem}:${normalizedUser}`;
    return `${CACHE_PREFIX}${sha256(payload)}`;
}

function buildBigramHashKey(provider: string, model: string): string {
    return `${CACHE_PREFIX}ngrams:${provider}:${model}`;
}

function getBigrams(text: string): string[] {
    const normalized = normalizeText(text);
    const words = normalized.split(' ').filter(w => w.length > 0);
    const bigrams: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
        bigrams.push(`${words[i]} ${words[i + 1]}`);
    }
    return bigrams;
}

async function addBigramEntries(hashKey: string, bigrams: string[], cacheKeyHash: string): Promise<void> {
    for (const bigram of bigrams) {
        const raw = await redisClient.hGet(hashKey, bigram);
        const existing: string[] = raw ? JSON.parse(raw) : [];
        if (!existing.includes(cacheKeyHash)) {
            existing.push(cacheKeyHash);
            await redisClient.hSet(hashKey, bigram, JSON.stringify(existing));
        }
    }
}

async function removeBigramEntries(hashKey: string, bigrams: string[], cacheKeyHash: string): Promise<void> {
    for (const bigram of bigrams) {
        const raw = await redisClient.hGet(hashKey, bigram);
        if (!raw) continue;
        const existing: string[] = JSON.parse(raw);
        const updated = existing.filter((h: string) => h !== cacheKeyHash);
        if (updated.length === 0) {
            await redisClient.hDel(hashKey, bigram);
        } else {
            await redisClient.hSet(hashKey, bigram, JSON.stringify(updated));
        }
    }
}

// ============================================================================
// Cache Operations
// ============================================================================

async function getFromCache(key: string): Promise<CacheEntry | null> {
    try {
        await ensureRedisConnected();
        const raw = await redisClient.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as CacheEntry;
    } catch {
        stats.errors++;
        return null;
    }
}

async function setInCache(key: string, entry: CacheEntry, ttlSeconds: number): Promise<void> {
    try {
        await ensureRedisConnected();
        await redisClient.set(key, JSON.stringify(entry), { EX: ttlSeconds });
    } catch {
        stats.errors++;
        // Silent fail — cache write failure should never block
    }
}

async function findSemanticMatch(
    provider: string,
    model: string,
    userMessage: string,
    _threshold: number
): Promise<CacheEntry | null> {
    try {
        await ensureRedisConnected();
        const queryBigrams = getBigrams(userMessage);
        if (queryBigrams.length === 0) return null;

        const hashKey = buildBigramHashKey(provider, model);
        const candidateCounts = new Map<string, number>();

        for (const bigram of queryBigrams) {
            const raw = await redisClient.hGet(hashKey, bigram);
            if (!raw) continue;
            const hashes: string[] = JSON.parse(raw);
            for (const h of hashes) {
                candidateCounts.set(h, (candidateCounts.get(h) || 0) + 1);
            }
        }

        if (candidateCounts.size === 0) return null;

        // Find candidate with most bigram overlaps
        let bestKeyHash = '';
        let bestCount = 0;
        candidateCounts.forEach((count, keyHash) => {
            if (count > bestCount) {
                bestCount = count;
                bestKeyHash = keyHash;
            }
        });

        // Require at least 50% bigram overlap (bigrams are order-sensitive)
        if (bestCount < queryBigrams.length * 0.5) return null;

        const entry = await getFromCache(`${CACHE_PREFIX}${bestKeyHash}`);
        return entry;
    } catch {
        stats.errors++;
        return null;
    }
}

// ============================================================================
// Main API
// ============================================================================

type CallAIFunc = (
    prompt: string,
    model?: string,
    providerType?: AIProviderType,
    systemPrompt?: string,
    userId?: string,
    ...args: any[]
) => Promise<string>;

/**
 * Wraps a callAI function with LLM response caching.
 * Cache-aside: check cache → miss → call LLM → store in cache.
 */
export function createCachedCallAI(callAI: CallAIFunc): CallAIFunc {
    return async function cachedCallAI(
        prompt: string,
        model?: string,
        providerType?: string,
        systemPrompt?: string,
        userId?: string,
        ...args: any[]
    ): Promise<string> {
        const provider = providerType || 'gemini';
        const actualModel = model || 'gemini-2.0-flash';
        const paperCount = (args.length > 0 && typeof args[0] === 'number') ? args[0] as number : undefined;
        const options = (args.length > 1 && typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null && 'ttlSeconds' in args[args.length - 1]) ? args[args.length - 1] as CacheOptions : (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && 'ttlSeconds' in args[0]) ? args[0] as CacheOptions : {};
        const ttl = options.ttlSeconds ?? DEFAULT_TTL;
        const threshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

        // Build exact cache key
        const cacheKey = buildExactKey(provider, actualModel, systemPrompt || '', prompt);

        // 1. Try exact match
        const exact = await getFromCache(cacheKey);
        if (exact) {
            stats.hits++;
            stats.totalSaved++;
            console.log(`[LLM-Cache] HIT (exact) — ${provider}/${actualModel} — saved API call`);
            return exact.content;
        }

        // 2. Try semantic match
        const semantic = await findSemanticMatch(provider, actualModel, prompt, threshold);
        if (semantic) {
            stats.semanticHits++;
            stats.totalSaved++;
            console.log(`[LLM-Cache] HIT (semantic) — ${provider}/${actualModel} — saved API call`);
            return semantic.content;
        }

        // 3. Cache miss — call LLM
        stats.misses++;
        console.log(`[LLM-Cache] MISS — ${provider}/${actualModel} — calling API`);

        const response = await callAI(prompt, model, providerType as AIProviderType | undefined, systemPrompt, userId, ...args);

        // 4. Store in cache
        const entry: CacheEntry = {
            content: response,
            model: actualModel,
            provider,
            cachedAt: Date.now(),
        };

        await setInCache(cacheKey, entry, ttl);

        // 5. Store bigram index entries for semantic matching
        const normalizedUser = normalizeText(prompt);
        const normalizedSystem = normalizeText(systemPrompt || '');
        const cacheKeyHash = sha256(`${provider}:${actualModel}:${normalizedSystem}:${normalizedUser}`);
        const bigrams = getBigrams(prompt);
        const bigramHashKey = buildBigramHashKey(provider, actualModel);
        await addBigramEntries(bigramHashKey, bigrams, cacheKeyHash);

        return response;
    };
}

/**
 * Get cache statistics (runtime, resets on restart)
 */
export function getCacheStats(): CacheStats {
    return { ...stats };
}

/**
 * Reset cache stats
 */
export function resetCacheStats(): void {
    stats.hits = 0;
    stats.misses = 0;
    stats.semanticHits = 0;
    stats.errors = 0;
    stats.totalSaved = 0;
}

/**
 * Invalidate cache entries by pattern
 * @param pattern - optional pattern to match (e.g., 'gemini:*' for all gemini entries)
 * @returns number of keys deleted
 */
export async function invalidateCache(pattern?: string): Promise<number> {
    try {
        await ensureRedisConnected();
        const searchPattern = pattern
            ? `${CACHE_PREFIX}${pattern}`
            : `${CACHE_PREFIX}*`;

        let cursor: string | number = '0';
        let deletedCount = 0;
        const keysToDelete: string[] = [];

        do {
            const reply: any = await (redisClient.scan as any)(cursor, {
                MATCH: searchPattern,
                COUNT: 100,
            });
            cursor = reply.cursor || '0';
            keysToDelete.push(...(reply.keys || []));
        } while (cursor !== '0' && cursor !== 0);

        // Also find bigram hash keys to delete
        const bigramPattern = pattern
            ? `${CACHE_PREFIX}ngrams:${pattern}`
            : `${CACHE_PREFIX}ngrams:*`;
        cursor = '0';
        do {
            const reply: any = await (redisClient.scan as any)(cursor, {
                MATCH: bigramPattern,
                COUNT: 100,
            });
            cursor = reply.cursor || '0';
            keysToDelete.push(...(reply.keys || []));
        } while (cursor !== '0' && cursor !== 0);

        // Batch delete
        const batchSize = 100;
        for (let i = 0; i < keysToDelete.length; i += batchSize) {
            const batch = keysToDelete.slice(i, i + batchSize);
            await redisClient.del(batch);
            deletedCount += batch.length;
        }

        console.log(`[LLM-Cache] Invalidated ${deletedCount} keys`);
        return deletedCount;
    } catch (error) {
        stats.errors++;
        console.error('[LLM-Cache] Invalidation failed:', error);
        return 0;
    }
}
