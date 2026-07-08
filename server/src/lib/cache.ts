import { ensureRedisConnected, redisClient } from '../queues/redis.js';

function buildNamespacedKey(key: string): string {
    return `cache:${key}`;
}

/**
 * Convert glob pattern to Redis SCAN pattern
 * Example: "leaderboard:v1:*" stays "leaderboard:v1:*"
 *          "leaderboard:v1:week:*" stays "leaderboard:v1:week:*"
 */
function buildPatternKey(pattern: string): string {
    // Ensure pattern is scoped to cache namespace
    if (pattern.startsWith('cache:')) {
        return pattern;
    }
    return `cache:${pattern}`;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
    try {
        await ensureRedisConnected();
        const value = await redisClient.get(buildNamespacedKey(key));
        return value ? (JSON.parse(value) as T) : null;
    } catch (error) {
        console.warn('[Cache] cacheGet failed:', error);
        return null;
    }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
        await ensureRedisConnected();
        await redisClient.set(buildNamespacedKey(key), JSON.stringify(value), { EX: ttlSeconds });
    } catch (error) {
        console.warn('[Cache] cacheSet failed:', error);
    }
}

export async function cacheDel(key: string): Promise<void> {
    try {
        await ensureRedisConnected();
        await redisClient.del(buildNamespacedKey(key));
    } catch (error) {
        console.warn('[Cache] cacheDel failed:', error);
    }
}

/**
 * Delete all keys matching a pattern using SCAN
 * Returns number of keys deleted
 * 
 * Example patterns:
 * - "cache:leaderboard:v1:*" (wildcard)
 * - "cache:user:*:gaps:*" (multiple wildcards)
 */
export async function cacheDeleteByPattern(pattern: string): Promise<number> {
    try {
        await ensureRedisConnected();
        const patternKey = buildPatternKey(pattern);

        let cursor: string | number = '0';
        let deletedCount = 0;
        const keysToDelete: string[] = [];

        // SCAN returns { cursor, keys }
        do {
            const reply: any = await (redisClient.scan as any)(cursor, {
                MATCH: patternKey,
                COUNT: 100,
            });

            cursor = reply.cursor || '0';
            const keys: string[] = reply.keys || [];

            keysToDelete.push(...keys);
        } while (cursor !== '0' && cursor !== 0);

        // Delete in batches
        if (keysToDelete.length > 0) {
            const batchSize = 100;
            for (let i = 0; i < keysToDelete.length; i += batchSize) {
                const batch = keysToDelete.slice(i, i + batchSize);
                await redisClient.del(batch);
                deletedCount += batch.length;
            }
        }

        return deletedCount;
    } catch (error) {
        console.error('[Cache] cacheDeleteByPattern failed:', error);
        throw error;
    }
}

/**
 * Cache object with fluent interface
 */
export const cache = {
    async get<T>(key: string): Promise<T | null> {
        return cacheGet<T>(key);
    },

    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
        return cacheSet(key, value, ttlSeconds);
    },

    async del(key: string): Promise<void> {
        return cacheDel(key);
    },

    async exists(key: string): Promise<boolean> {
        try {
            await ensureRedisConnected();
            const exists = await redisClient.exists(buildNamespacedKey(key));
            return exists === 1;
        } catch (error) {
            console.warn('[Cache] exists check failed:', error);
            return false;
        }
    },

    async deleteByPattern(pattern: string): Promise<number> {
        return cacheDeleteByPattern(pattern);
    },
};
