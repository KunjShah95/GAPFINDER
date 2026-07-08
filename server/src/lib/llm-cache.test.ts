// ============================================================================
// LLM Cache Tests
// Unit tests for llm-cache.ts
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCachedCallAI, getCacheStats, resetCacheStats, invalidateCache } from './llm-cache.js';

// Mock Redis
const store = new Map<string, string>();
const hashStore = new Map<string, Map<string, string>>();

vi.mock('../queues/redis.js', () => ({
    ensureRedisConnected: vi.fn().mockResolvedValue(undefined),
    redisClient: {
        isOpen: true,
        get: vi.fn().mockImplementation(async (key: string) => store.get(key) || null),
        set: vi.fn().mockImplementation(async (key: string, value: string) => {
            store.set(key, value);
        }),
        del: vi.fn().mockImplementation(async (keys: string[]) => {
            let count = 0;
            for (const key of keys) {
                if (store.delete(key)) count++;
                if (hashStore.delete(key)) count++;
            }
            return count;
        }),
        scan: vi.fn().mockImplementation(async (_cursor: string, opts: any) => {
            const pattern = opts.MATCH || '*';
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            const matches = Array.from(store.keys()).filter(k => regex.test(k));
            const hashMatches = Array.from(hashStore.keys()).filter(k => regex.test(k));
            return { cursor: '0', keys: [...matches, ...hashMatches] };
        }),
        hGet: vi.fn().mockImplementation(async (key: string, field: string) => {
            const hash = hashStore.get(key);
            return hash?.get(field) || null;
        }),
        hSet: vi.fn().mockImplementation(async (key: string, field: string, value: string) => {
            if (!hashStore.has(key)) hashStore.set(key, new Map());
            hashStore.get(key)!.set(field, value);
        }),
        hDel: vi.fn().mockImplementation(async (key: string, field: string) => {
            const hash = hashStore.get(key);
            if (hash) hash.delete(field);
        }),
    },
}));

describe('LLM Cache', () => {
    beforeEach(() => {
        resetCacheStats();
        // Clear mock stores
        store.clear();
        hashStore.clear();
    });

    describe('createCachedCallAI', () => {
        it('should cache LLM responses and return cached on second call', async () => {
            const mockCallAI = vi.fn().mockResolvedValue('Hello from LLM');
            const cachedCallAI = createCachedCallAI(mockCallAI);

            // First call — should call LLM
            const result1 = await cachedCallAI('What is AI?', undefined, 'gemini');
            expect(result1).toBe('Hello from LLM');
            expect(mockCallAI).toHaveBeenCalledTimes(1);

            // Second call — should hit cache
            const result2 = await cachedCallAI('What is AI?', undefined, 'gemini');
            expect(result2).toBe('Hello from LLM');
            expect(mockCallAI).toHaveBeenCalledTimes(1); // Still 1, not 2

            const stats = getCacheStats();
            expect(stats.hits).toBe(1);
            expect(stats.misses).toBe(1);
        });

        it('should differentiate cache keys by provider', async () => {
            const mockCallAI = vi.fn()
                .mockResolvedValueOnce('Gemini response')
                .mockResolvedValueOnce('OpenAI response');
            const cachedCallAI = createCachedCallAI(mockCallAI);

            const r1 = await cachedCallAI('Test prompt', undefined, 'gemini');
            const r2 = await cachedCallAI('Test prompt', undefined, 'openai');

            expect(r1).toBe('Gemini response');
            expect(r2).toBe('OpenAI response');
            expect(mockCallAI).toHaveBeenCalledTimes(2);
        });

        it('should differentiate cache keys by model', async () => {
            const mockCallAI = vi.fn()
                .mockResolvedValueOnce('Flash response')
                .mockResolvedValueOnce('Pro response');
            const cachedCallAI = createCachedCallAI(mockCallAI);

            const r1 = await cachedCallAI('Test', 'gemini-2.0-flash', 'gemini');
            const r2 = await cachedCallAI('Test', 'gemini-1.5-pro', 'gemini');

            expect(r1).toBe('Flash response');
            expect(r2).toBe('Pro response');
            expect(mockCallAI).toHaveBeenCalledTimes(2);
        });

        it('should normalize text for cache keys (case, whitespace, punctuation)', async () => {
            const mockCallAI = vi.fn().mockResolvedValue('Response');
            const cachedCallAI = createCachedCallAI(mockCallAI);

            await cachedCallAI('What is AI?', undefined, 'gemini');
            await cachedCallAI('what is ai', undefined, 'gemini');
            await cachedCallAI('What  is  AI !', undefined, 'gemini');

            // All should hit cache after first call
            expect(mockCallAI).toHaveBeenCalledTimes(1);
            expect(getCacheStats().hits).toBe(2);
        });

        it('should preserve C++ and other internal punctuation in normalization', async () => {
            const mockCallAI = vi.fn()
                .mockResolvedValueOnce('C++ response')
                .mockResolvedValueOnce('C# response');
            const cachedCallAI = createCachedCallAI(mockCallAI);

            // Use very different queries to avoid semantic matching
            const r1 = await cachedCallAI('Explain the C++ language', undefined, 'gemini');
            const r2 = await cachedCallAI('Explain the C# language', undefined, 'gemini');

            // Both should be different because normalized forms differ ("c++" vs "c#")
            expect(r1).toBe('C++ response');
            expect(r2).toBe('C# response');
            expect(mockCallAI).toHaveBeenCalledTimes(2);

            // Exact hit for C++
            const r3 = await cachedCallAI('Explain the C++ language', undefined, 'gemini');
            expect(r3).toBe('C++ response');
            expect(mockCallAI).toHaveBeenCalledTimes(2);
            expect(getCacheStats().hits).toBe(1);
        });

        it('should handle semantic matching for rephrased queries', async () => {
            const mockCallAI = vi.fn().mockResolvedValue('AI is a field of computer science');
            const cachedCallAI = createCachedCallAI(mockCallAI);

            // Original query
            await cachedCallAI('What is artificial intelligence and how does it work', undefined, 'gemini');
            expect(mockCallAI).toHaveBeenCalledTimes(1);

            // Rephrased query with high bigram overlap (same word order, minor changes)
            const result = await cachedCallAI('What is artificial intelligence and how does it actually work', undefined, 'gemini');
            expect(result).toBe('AI is a field of computer science');
            // Should be a semantic hit, not a new LLM call
            expect(mockCallAI).toHaveBeenCalledTimes(1);
            expect(getCacheStats().semanticHits).toBe(1);
        });

        it('should not cache if LLM call fails', async () => {
            const mockCallAI = vi.fn().mockRejectedValue(new Error('API error'));
            const cachedCallAI = createCachedCallAI(mockCallAI);

            await expect(cachedCallAI('Test', undefined, 'gemini')).rejects.toThrow('API error');
            await expect(cachedCallAI('Test', undefined, 'gemini')).rejects.toThrow('API error');

            // Both should call LLM (no caching of errors)
            expect(mockCallAI).toHaveBeenCalledTimes(2);
        });
    });

    describe('invalidateCache', () => {
        it('should delete cached entries', async () => {
            const mockCallAI = vi.fn().mockResolvedValue('Response');
            const cachedCallAI = createCachedCallAI(mockCallAI);

            await cachedCallAI('Test query', undefined, 'gemini');
            expect(mockCallAI).toHaveBeenCalledTimes(1);

            const deleted = await invalidateCache();
            expect(deleted).toBeGreaterThan(0);

            // After invalidation, should call LLM again
            await cachedCallAI('Test query', undefined, 'gemini');
            expect(mockCallAI).toHaveBeenCalledTimes(2);
        });
    });

    describe('getCacheStats', () => {
        it('should track hits, misses, and semantic hits', async () => {
            const mockCallAI = vi.fn().mockResolvedValue('Response');
            const cachedCallAI = createCachedCallAI(mockCallAI);

            await cachedCallAI('Query one', undefined, 'gemini');
            await cachedCallAI('Query one', undefined, 'gemini');
            await cachedCallAI('Query two', undefined, 'gemini');

            const stats = getCacheStats();
            expect(stats.misses).toBe(2);  // Two unique queries
            expect(stats.hits).toBe(1);    // One exact cache hit
        });
    });
});
