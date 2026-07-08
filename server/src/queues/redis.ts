import { createClient } from 'redis';
import { config } from '../config.js';

export function getBullConnection() {
    return {
        url: config.redisUrl,
    };
}

export const redisClient = createClient({
    url: config.redisUrl,
});

redisClient.on('error', (error) => {
    console.error('[Redis] Connection error:', error.message);
});

export async function ensureRedisConnected(): Promise<void> {
    if (!redisClient.isOpen) {
        await redisClient.connect();
        console.log('[Redis] Connected');
    }
}

export async function closeRedis(): Promise<void> {
    if (redisClient.isOpen) {
        await redisClient.quit();
    }
}
