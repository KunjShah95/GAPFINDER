// ============================================================================
// GapMiner Backend Server
// Express + PostgreSQL + Secure API Proxy
// ============================================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import { config, validateConfig } from './config.js';
import { checkHealth, closePool } from './db/client.js';
import { initSocket, getIO } from './lib/socket.js';

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: config.nodeEnv,
    enabled: config.nodeEnv === 'production',
    integrations: [
        Sentry.httpIntegration(),
    ],
    tracesSampleRate: config.nodeEnv === 'production' ? 0.1 : 1.0,
});

// Routes
import authRoutes from './routes/auth.js';
import papersRoutes from './routes/papers.js';
import gapsRoutes from './routes/gaps.js';
import collectionsRoutes from './routes/collections.js';
import aiRoutes from './routes/ai.js';
import publicApiRoutes from './routes/public-api.js';
import communityRoutes from './routes/community.js';
import alertsRoutes from './routes/alerts.js';
import organizationsRoutes from './routes/organizations.js';
import analyticsRoutes from './routes/analytics.js';
import bookmarksRoutes from './routes/bookmarks.js';
import exportRoutes from './routes/export.js';
import importRoutes from './routes/import.js';
import webhooksRoutes from './routes/webhooks.js';
import webhookDeliveriesRoutes from './routes/webhook-deliveries.js';
import gamificationRoutes from './routes/gamification.js';
import searchRoutes from './routes/search.js';
import activityRoutes from './routes/activity.js';
import annotationsRoutes from './routes/annotations.js';
import commentsRoutes from './routes/comments.js';
import recommendationsRoutes from './routes/recommendations.js';
import billingRoutes from './routes/billing.js';
import apiKeysRoutes from './routes/api-keys.js';
import latestPapersRoutes from './routes/latest-papers.js';
import digestsRoutes from './routes/digests.js';
import apiUsageRoutes from './routes/api-usage.js';
import enterpriseRoutes from './routes/enterprise.js';
import featureGatesRoutes from './routes/feature-gates.js';
import notificationsRoutes from './routes/notifications.js';
import integrationsRoutes from './routes/integrations.js';
import docsRoutes from './routes/docs.js';
import workflowsRoutes from './routes/workflows.js';
import knowledgeGraphRoutes from './routes/knowledge-graph.js';
import grantsRoutes from './routes/grants.js';
import adminRoutes from './routes/admin.js';
import impactRoutes from './routes/impact.js';
import datasetsRoutes from './routes/datasets.js';
import competitorsRoutes from './routes/competitors.js';
import { startLatestPapersCron, stopLatestPapersCron } from './services/latest-papers-cron.js';

const app = express();

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS — allow frontend origin
app.use(cors({
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '5mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// More aggressive rate limit for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many authentication attempts' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Request logging (dev only)
if (config.isDev) {
    app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
        console.log(`${req.method} ${req.path}`);
        next();
    });
}

// ============================================================================
// ROUTES
// ============================================================================

app.use('/api/auth', authRoutes);
app.use('/api/papers', papersRoutes);
app.use('/api/gaps', gapsRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/public', publicApiRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/orgs', organizationsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/bookmarks', bookmarksRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/import', importRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/webhooks', webhookDeliveriesRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/annotations', annotationsRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/api-keys', apiKeysRoutes);
app.use('/api/latest-papers', latestPapersRoutes);
app.use('/api/digests', digestsRoutes);
app.use('/api/usage', apiUsageRoutes);
app.use('/api/enterprise', enterpriseRoutes);
app.use('/api/feature-gates', featureGatesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/docs', docsRoutes);
app.use('/api/workflows', workflowsRoutes);
app.use('/api/knowledge-graph', knowledgeGraphRoutes);
app.use('/api/grants', grantsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/impact', impactRoutes);
app.use('/api/datasets', datasetsRoutes);
app.use('/api/competitors', competitorsRoutes);

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/api/health', async (_req: express.Request, res: express.Response) => {
    const dbHealth = await checkHealth();

    res.json({
        status: dbHealth.ok ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: dbHealth,
        services: {
            gemini: !!config.geminiApiKey,
            firecrawl: !!config.firecrawlApiKey,
        },
    });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((_req: express.Request, res: express.Response) => {
    res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Server] Unhandled error:', err);
    
    Sentry.captureException(err);

    res.status(500).json({
        error: config.isDev ? err.message : 'Internal server error',
    });
});

// ============================================================================
// STARTUP
// ============================================================================

validateConfig();

// Start the latest-papers cron job (guarded for multi-instance deployments)
if (config.runLatestPapersCron) {
    startLatestPapersCron();
} else {
    console.log('[Server] RUN_LATEST_PAPERS_CRON=false — skipping scheduler startup');
}

const server = app.listen(config.port, () => {
    initSocket(server);
    console.log(`
╔══════════════════════════════════════════════════╗
║           🔬 GapMiner Backend Server             ║
╠══════════════════════════════════════════════════╣
║  Port:      ${String(config.port).padEnd(37)}║
║  Env:       ${config.nodeEnv.padEnd(37)}║
║  CORS:      ${config.corsOrigin.padEnd(37)}║
║  WebSocket: /ws                                  ║
║  Database:  PostgreSQL                           ║
╚══════════════════════════════════════════════════╝
    `);
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

async function gracefulShutdown(signal: string) {
    console.log(`\n[Server] ${signal} received — shutting down gracefully...`);

    server.close(async () => {
        stopLatestPapersCron();
        await closePool();
        console.log('[Server] Goodbye! 👋');
        process.exit(0);
    });

    // Force shutdown after 10s
    setTimeout(() => {
        console.error('[Server] Could not close connections in time, forcing shutdown');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
