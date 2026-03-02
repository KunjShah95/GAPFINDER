// ============================================================================
// Server Configuration
// Centralized config with validation
// ============================================================================

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from server directory, then project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function requireEnv(key: string, fallback?: string): string {
    const value = process.env[key] || fallback;
    if (!value) {
        console.warn(`[Config] Warning: ${key} is not set`);
        return '';
    }
    return value;
}

export const config = {
    // Server
    port: parseInt(process.env.PORT || '3001', 10),
    isDev: process.env.NODE_ENV !== 'production',
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

    // Database
    databaseUrl: requireEnv('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/gapminer'),
    dbPoolMax: parseInt(process.env.DB_POOL_MAX || '20', 10),

    // Auth
    jwtSecret: requireEnv('JWT_SECRET', 'dev-secret-change-in-production-min-32-chars!!'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),

    // API Keys (kept on server only — never exposed to frontend)
    geminiApiKey: requireEnv('GEMINI_API_KEY'),
    firecrawlApiKey: requireEnv('FIRECRAWL_API_KEY'),
    
    // AI Provider API Keys (Multiple providers supported)
    openaiApiKey: requireEnv('OPENAI_API_KEY'),
    anthropicApiKey: requireEnv('ANTHROPIC_API_KEY'),
    openrouterApiKey: requireEnv('OPENROUTER_API_KEY'),
    deepseekApiKey: requireEnv('DEEPSEEK_API_KEY'),
    mistralApiKey: requireEnv('MISTRAL_API_KEY'),
    cohereApiKey: requireEnv('COHERE_API_KEY'),
    
    // Default AI provider (gemini, openai, anthropic, openrouter, deepseek, mistral, cohere)
    defaultAiProvider: process.env.DEFAULT_AI_PROVIDER || 'gemini',

    // Rate Limiting
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    },

    // Subscription Limits
    limits: {
        free: { papersPerMonth: 10, gapsPerPaper: 20, apiCallsPerDay: 50 },
        pro: { papersPerMonth: 100, gapsPerPaper: 50, apiCallsPerDay: 500 },
        team: { papersPerMonth: 500, gapsPerPaper: 100, apiCallsPerDay: 2000 },
        enterprise: { papersPerMonth: -1, gapsPerPaper: -1, apiCallsPerDay: -1 },
    },
} as const;

// Validate critical config on startup
export function validateConfig(): void {
    const warnings: string[] = [];

    // Check if any AI provider is configured
    const hasAIProvider = 
        config.geminiApiKey || 
        config.openaiApiKey || 
        config.anthropicApiKey || 
        config.openrouterApiKey ||
        config.deepseekApiKey ||
        config.mistralApiKey ||
        config.cohereApiKey;
    
    if (!hasAIProvider) warnings.push('No AI provider configured — AI features will fail');
    if (!config.firecrawlApiKey) warnings.push('FIRECRAWL_API_KEY not set — scraping will fail');
    if (config.jwtSecret.includes('dev-secret')) warnings.push('JWT_SECRET using default — change for production!');

    if (warnings.length > 0) {
        console.warn('\n⚠️  Configuration Warnings:');
        warnings.forEach(w => console.warn(`   • ${w}`));
        console.warn('');
    }
}

// Helper to get all configured AI providers
export function getAIProviderConfigs() {
    const configs: { type: 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'deepseek' | 'mistral' | 'cohere'; apiKey: string; default?: boolean }[] = [];
    
    if (config.geminiApiKey) {
        configs.push({ 
            type: 'gemini', 
            apiKey: config.geminiApiKey, 
            default: config.defaultAiProvider === 'gemini' || configs.length === 0 
        });
    }
    if (config.openaiApiKey) {
        configs.push({ 
            type: 'openai', 
            apiKey: config.openaiApiKey, 
            default: config.defaultAiProvider === 'openai' || configs.length === 0 
        });
    }
    if (config.anthropicApiKey) {
        configs.push({ 
            type: 'anthropic', 
            apiKey: config.anthropicApiKey, 
            default: config.defaultAiProvider === 'anthropic' || configs.length === 0 
        });
    }
    if (config.openrouterApiKey) {
        configs.push({ 
            type: 'openrouter', 
            apiKey: config.openrouterApiKey, 
            default: config.defaultAiProvider === 'openrouter' || configs.length === 0 
        });
    }
    if (config.deepseekApiKey) {
        configs.push({ 
            type: 'deepseek', 
            apiKey: config.deepseekApiKey, 
            default: config.defaultAiProvider === 'deepseek' || configs.length === 0 
        });
    }
    if (config.mistralApiKey) {
        configs.push({ 
            type: 'mistral', 
            apiKey: config.mistralApiKey, 
            default: config.defaultAiProvider === 'mistral' || configs.length === 0 
        });
    }
    if (config.cohereApiKey) {
        configs.push({ 
            type: 'cohere', 
            apiKey: config.cohereApiKey, 
            default: config.defaultAiProvider === 'cohere' || configs.length === 0 
        });
    }
    
    return configs;
}
