/**
 * Cache Invalidation Strategies
 * 
 * Handles smart cache invalidation when data changes.
 * Prevents stale data while minimizing unnecessary invalidations.
 */

import { cache } from './cache.js';

export interface InvalidationConfig {
    pattern?: string | string[];  // Redis key pattern(s) to invalidate
    tags?: string[];              // Cache tags to invalidate
    ttl?: number;                 // Set new TTL on invalidation
}

/**
 * Invalidate cache by key pattern(s)
 * Supports wildcards: * matches any character
 * Example: "leaderboard:v1:*" invalidates all leaderboard versions
 */
export async function invalidateByPattern(patterns: string | string[]): Promise<number> {
    const patternList = Array.isArray(patterns) ? patterns : [patterns];
    let invalidated = 0;

    for (const pattern of patternList) {
        try {
            const deleted = await cache.deleteByPattern(pattern);
            invalidated += deleted;
            console.log(`[Cache] Invalidated ${deleted} keys matching "${pattern}"`);
        } catch (error) {
            console.error(`[Cache] Failed to invalidate pattern "${pattern}":`, error);
            // Don't throw — continue with other patterns
        }
    }

    return invalidated;
}

/**
 * Invalidate specific cache tags
 * Use when you have semantic grouping of cache keys
 */
export async function invalidateByTags(tags: string[]): Promise<number> {
    let invalidated = 0;

    for (const tag of tags) {
        // Find all keys with this tag (stored as: cache:key:tag1:tag2:...)
        const pattern = `cache:*:${tag}:*`;
        const deleted = await cache.deleteByPattern(pattern);
        invalidated += deleted;
    }

    return invalidated;
}

/**
 * Smart cache invalidation for gap-related data changes
 * Triggered when new gaps are added, gaps are voted on, etc.
 */
export async function invalidateGapsCache(options: {
    userId?: string;
    paperId?: string;
    global?: boolean;
}): Promise<void> {
    const patterns: string[] = [];

    // Global leaderboard is affected by any new gap
    patterns.push(
        'cache:leaderboard:v1:*',       // All leaderboard timeframes
        'cache:gaps:trending:*',        // Trending gaps cache
        'cache:stats:global:*'          // Global statistics
    );

    // User-specific caches
    if (options.userId) {
        patterns.push(
            `cache:user:${options.userId}:gaps:*`,
            `cache:user:${options.userId}:recent:*`,
            `cache:user:${options.userId}:stats:*`
        );
    }

    // Paper-specific caches
    if (options.paperId) {
        patterns.push(
            `cache:paper:${options.paperId}:gaps:*`,
            `cache:paper:${options.paperId}:analysis:*`
        );
    }

    for (const pattern of patterns) {
        await invalidateByPattern(pattern).catch((err) => {
            console.error(`[Cache] Failed to invalidate "${pattern}":`, err);
        });
    }

    console.log(
        `[Cache] Invalidated gap-related caches (user=${options.userId}, paper=${options.paperId})`
    );
}

/**
 * Smart cache invalidation for vote-related data changes
 */
export async function invalidateVoteCache(options: {
    gapId: string;
    userId?: string;
}): Promise<void> {
    const patterns = [
        'cache:leaderboard:v1:*',           // Vote affects leaderboard ranking
        `cache:gap:${options.gapId}:*`,     // Gap-specific cache
    ];

    if (options.userId) {
        patterns.push(`cache:user:${options.userId}:votes:*`);
    }

    for (const pattern of patterns) {
        await invalidateByPattern(pattern).catch((err) => {
            console.error(`[Cache] Failed to invalidate "${pattern}":`, err);
        });
    }
}

/**
 * Warm up critical caches (pro-active cache population)
 * Run periodically to pre-populate expensive-to-compute data
 */
export async function warmupCaches(): Promise<void> {
    console.log('[Cache] Starting cache warmup...');

    // Could warm up:
    // - Top 10 gaps (leaderboard)
    // - Recent papers
    // - User statistics
    // - Global stats

    // This is a hook for future implementation
    console.log('[Cache] Cache warmup complete');
}

/**
 * Cache invalidation event emitter
 * Use to reactively invalidate caches on data changes
 */
export class CacheInvalidator {
    async onGapCreated(gapId: string, paperId: string, userId: string): Promise<void> {
        await invalidateGapsCache({ userId, paperId, global: true });
    }

    async onGapVoted(gapId: string, userId: string): Promise<void> {
        await invalidateVoteCache({ gapId, userId });
    }

    async onGapDeleted(gapId: string, paperId: string, userId: string): Promise<void> {
        await invalidateGapsCache({ userId, paperId, global: true });
    }

    async onPaperAdded(paperId: string, userId: string): Promise<void> {
        await invalidateByPattern([
            `cache:user:${userId}:*`,
            'cache:leaderboard:v1:*'
        ]);
    }
}

export const cacheInvalidator = new CacheInvalidator();
