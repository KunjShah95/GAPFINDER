// ============================================================================
// Dynamic Configuration System
// Allows runtime configuration changes without redeployment
// ============================================================================

import { query } from '../db/client.js';

// ============================================================================
// Types
// ============================================================================

export interface ConfigCategory {
    name: string;
    description: string;
    isPublic: boolean;
}

export interface ConfigItem {
    id: string;
    category: string;
    key: string;
    value: any;
    valueType: 'string' | 'number' | 'boolean' | 'json' | 'array';
    description: string;
    isPublic: boolean;
    isFeatureFlag: boolean;
    updatedAt: Date;
    updatedBy: string | null;
}

export interface FeatureFlags {
    [key: string]: boolean;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

const DEFAULT_CONFIGS: Omit<ConfigItem, 'id' | 'updatedAt' | 'updatedBy'>[] = [
    // AI Configuration
    { category: 'ai', key: 'defaultModel', value: 'gemini-2.0-flash', valueType: 'string', description: 'Default AI model to use', isPublic: false, isFeatureFlag: false },
    { category: 'ai', key: 'fallbackModel', value: 'gpt-4o-mini', valueType: 'string', description: 'Fallback AI model', isPublic: false, isFeatureFlag: false },
    { category: 'ai', key: 'maxTokens', value: 8192, valueType: 'number', description: 'Max tokens for AI responses', isPublic: false, isFeatureFlag: false },
    { category: 'ai', key: 'temperature', value: 0.7, valueType: 'number', description: 'AI temperature setting', isPublic: false, isFeatureFlag: false },
    { category: 'ai', key: 'enabledProviders', value: ['gemini', 'openai', 'anthropic'], valueType: 'array', description: 'Enabled AI providers', isPublic: false, isFeatureFlag: false },
    
    // Subscription Plans
    { category: 'subscription', key: 'free_tier.papersPerMonth', value: 10, valueType: 'number', description: 'Free tier papers per month', isPublic: true, isFeatureFlag: false },
    { category: 'subscription', key: 'free_tier.gapsPerPaper', value: 20, valueType: 'number', description: 'Free tier gaps per paper', isPublic: true, isFeatureFlag: false },
    { category: 'subscription', key: 'free_tier.apiCallsPerDay', value: 50, valueType: 'number', description: 'Free tier API calls per day', isPublic: true, isFeatureFlag: false },
    { category: 'subscription', key: 'pro_tier.papersPerMonth', value: 100, valueType: 'number', description: 'Pro tier papers per month', isPublic: true, isFeatureFlag: false },
    { category: 'subscription', key: 'pro_tier.gapsPerPaper', value: 50, valueType: 'number', description: 'Pro tier gaps per paper', isPublic: true, isFeatureFlag: false },
    { category: 'subscription', key: 'pro_tier.apiCallsPerDay', value: 500, valueType: 'number', description: 'Pro tier API calls per day', isPublic: true, isFeatureFlag: false },
    { category: 'subscription', key: 'team_tier.papersPerMonth', value: 500, valueType: 'number', description: 'Team tier papers per month', isPublic: true, isFeatureFlag: false },
    { category: 'subscription', key: 'team_tier.gapsPerPaper', value: 100, valueType: 'number', description: 'Team tier gaps per paper', isPublic: true, isFeatureFlag: false },
    { category: 'subscription', key: 'team_tier.apiCallsPerDay', value: 2000, valueType: 'number', description: 'Team tier API calls per day', isPublic: true, isFeatureFlag: false },
    
    // Rate Limiting
    { category: 'rateLimit', key: 'windowMs', value: 900000, valueType: 'number', description: 'Rate limit window in ms', isPublic: false, isFeatureFlag: false },
    { category: 'rateLimit', key: 'maxRequests', value: 100, valueType: 'number', description: 'Max requests per window', isPublic: false, isFeatureFlag: false },
    { category: 'rateLimit', key: 'authMaxRequests', value: 20, valueType: 'number', description: 'Max auth requests per window', isPublic: false, isFeatureFlag: false },
    
    // Gap Types
    { category: 'research', key: 'gapTypes', value: ['data', 'compute', 'evaluation', 'theory', 'deployment', 'methodology'], valueType: 'array', description: 'Available research gap types', isPublic: true, isFeatureFlag: false },
    { category: 'research', key: 'impactLevels', value: ['low', 'medium', 'high'], valueType: 'array', description: 'Impact score levels', isPublic: true, isFeatureFlag: false },
    { category: 'research', key: 'difficultyLevels', value: ['low', 'medium', 'high'], valueType: 'array', description: 'Difficulty levels', isPublic: true, isFeatureFlag: false },
    
    // Paper Sources
    { category: 'sources', key: 'enabledSources', value: ['arxiv', 'openreview', 'aclanthology', 'neurips', 'icml', 'iclr', 'cvpr', 'aaai'], valueType: 'array', description: 'Enabled paper sources', isPublic: true, isFeatureFlag: false },
    { category: 'sources', key: 'defaultSource', value: 'arxiv', valueType: 'string', description: 'Default paper source', isPublic: true, isFeatureFlag: false },
    
    // Feature Flags
    { category: 'features', key: 'enableRecommendations', value: true, valueType: 'boolean', description: 'Enable recommendation engine', isPublic: false, isFeatureFlag: true },
    { category: 'features', key: 'enableCommunity', value: true, valueType: 'boolean', description: 'Enable community features', isPublic: false, isFeatureFlag: true },
    { category: 'features', key: 'enableGamification', value: true, valueType: 'boolean', description: 'Enable gamification', isPublic: false, isFeatureFlag: true },
    { category: 'features', key: 'enableTeams', value: true, valueType: 'boolean', description: 'Enable team features', isPublic: false, isFeatureFlag: true },
    { category: 'features', key: 'enableApiKeys', value: true, valueType: 'boolean', description: 'Enable API key access', isPublic: false, isFeatureFlag: true },
    { category: 'features', key: 'enableWebhooks', value: true, valueType: 'boolean', description: 'Enable webhooks', isPublic: false, isFeatureFlag: true },
    { category: 'features', key: 'enableAlerts', value: true, valueType: 'boolean', description: 'Enable research alerts', isPublic: false, isFeatureFlag: true },
    { category: 'features', key: 'enablePublicGaps', value: true, valueType: 'boolean', description: 'Enable public gap sharing', isPublic: false, isFeatureFlag: true },
    
    // UI/UX
    { category: 'ui', key: 'theme', value: 'system', valueType: 'string', description: 'Default theme (light/dark/system)', isPublic: true, isFeatureFlag: false },
    { category: 'ui', key: 'itemsPerPage', value: 20, valueType: 'number', description: 'Items per page in lists', isPublic: true, isFeatureFlag: false },
    { category: 'ui', key: 'defaultLanguage', value: 'en', valueType: 'string', description: 'Default language', isPublic: true, isFeatureFlag: false },
    
    // Email
    { category: 'email', key: 'fromName', value: 'GapMiner', valueType: 'string', description: 'Email sender name', isPublic: false, isFeatureFlag: false },
    { category: 'email', key: 'fromEmail', value: 'noreply@gapminer.ai', valueType: 'string', description: 'Email sender address', isPublic: false, isFeatureFlag: false },
    { category: 'email', key: 'requireVerification', value: true, valueType: 'boolean', description: 'Require email verification', isPublic: false, isFeatureFlag: false },
];

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

let configCache: Map<string, any> = new Map();
let featureFlagsCache: FeatureFlags = {};
let cacheInitialized = false;
let cacheLastUpdated = 0;
const CACHE_TTL = 60000; // 1 minute

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function initializeConfigs(): Promise<void> {
    if (cacheInitialized) return;
    
    try {
        // Create table if not exists
        await query(`
            CREATE TABLE IF NOT EXISTS app_configs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                category VARCHAR(50) NOT NULL,
                key VARCHAR(100) NOT NULL,
                value JSONB NOT NULL,
                value_type VARCHAR(20) NOT NULL,
                description TEXT,
                is_public BOOLEAN DEFAULT FALSE,
                is_feature_flag BOOLEAN DEFAULT FALSE,
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                updated_by UUID REFERENCES users(id),
                UNIQUE(category, key)
            )
        `);
        
        // Insert default configs
        for (const config of DEFAULT_CONFIGS) {
            await query(`
                INSERT INTO app_configs (category, key, value, value_type, description, is_public, is_feature_flag)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (category, key) DO NOTHING
            `, [config.category, config.key, JSON.stringify(config.value), config.valueType, config.description, config.isPublic, config.isFeatureFlag]);
        }
        
        await loadCache();
        cacheInitialized = true;
    } catch (error) {
        console.error('[Config] Failed to initialize configs:', error);
    }
}

async function loadCache(): Promise<void> {
    try {
        const result = await query(`
            SELECT key, value, is_feature_flag 
            FROM app_configs 
            WHERE is_feature_flag = TRUE
        `);
        
        configCache.clear();
        featureFlagsCache = {};
        
        for (const row of result.rows) {
            configCache.set(row.key, row.value);
            if (row.is_feature_flag) {
                featureFlagsCache[row.key] = row.value;
            }
        }
        
        cacheLastUpdated = Date.now();
    } catch (error) {
        console.error('[Config] Failed to load cache:', error);
    }
}

function getFromCache(key: string): any {
    if (Date.now() - cacheLastUpdated > CACHE_TTL) {
        loadCache().catch(console.error);
    }
    return configCache.get(key);
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function getConfig(key: string, defaultValue?: any): Promise<any> {
    await initializeConfigs();
    return getFromCache(key) ?? defaultValue;
}

export async function getConfigCategory(category: string): Promise<ConfigItem[]> {
    await initializeConfigs();
    
    const result = await query(`
        SELECT id, category, key, value, value_type, description, is_public, is_feature_flag, updated_at
        FROM app_configs 
        WHERE category = $1
        ORDER BY key
    `, [category]);
    
    return result.rows.map(row => ({
        id: row.id,
        category: row.category,
        key: row.key,
        value: row.value,
        valueType: row.value_type,
        description: row.description,
        isPublic: row.is_public,
        isFeatureFlag: row.is_feature_flag,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by,
    }));
}

export async function getPublicConfigs(): Promise<Record<string, any>> {
    await initializeConfigs();
    
    const result = await query(`
        SELECT key, value FROM app_configs WHERE is_public = TRUE
    `);
    
    const configs: Record<string, any> = {};
    for (const row of result.rows) {
        configs[row.key] = row.value;
    }
    
    return configs;
}

export async function setConfig(
    key: string, 
    value: any, 
    updatedBy?: string
): Promise<void> {
    await initializeConfigs();
    
    const valueType = Array.isArray(value) ? 'array' : typeof value;
    
    await query(`
        UPDATE app_configs 
        SET value = $1, value_type = $2, updated_at = NOW(), updated_by = $3
        WHERE key = $4
    `, [JSON.stringify(value), valueType, updatedBy || null, key]);
    
    // Update cache
    configCache.set(key, value);
    if (key.startsWith('enable') || key.startsWith('is')) {
        featureFlagsCache[key] = value;
    }
}

export function isFeatureEnabled(key: string): boolean {
    return featureFlagsCache[key] === true;
}

export function getAllFeatureFlags(): FeatureFlags {
    return { ...featureFlagsCache };
}

export async function getSubscriptionLimits(tier: string): Promise<{
    papersPerMonth: number;
    gapsPerPaper: number;
    apiCallsPerDay: number;
}> {
    const papersPerMonth = await getConfig(`${tier}_tier.papersPerMonth`, 10);
    const gapsPerPaper = await getConfig(`${tier}_tier.gapsPerPaper`, 20);
    const apiCallsPerDay = await getConfig(`${tier}_tier.apiCallsPerDay`, 50);
    
    return { papersPerMonth, gapsPerPaper, apiCallsPerDay };
}

export async function getGapTypes(): Promise<string[]> {
    return await getConfig('gapTypes', ['data', 'compute', 'evaluation', 'theory', 'deployment', 'methodology']);
}

export async function getEnabledSources(): Promise<string[]> {
    return await getConfig('enabledSources', ['arxiv', 'openreview', 'aclanthology']);
}

export async function getEnabledProviders(): Promise<string[]> {
    return await getConfig('enabledProviders', ['gemini', 'openai', 'anthropic']);
}

// Initialize on module load
initializeConfigs().catch(console.error);
