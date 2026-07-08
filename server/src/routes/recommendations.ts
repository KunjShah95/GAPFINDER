// ============================================================================
// Recommendations API Routes
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireFeature } from '../middleware/auth.js';
import { getRecommendations, getTrendingGaps, discoverPapersForUser } from '../lib/recommendations.js';
import { getPublicConfigs, isFeatureEnabled } from '../lib/config.js';

const router = Router();

// ============================================================================
// GET /recommendations — Get personalized recommendations
// ============================================================================

const RecommendationsSchema = z.object({
    limit: z.number().min(1).max(50).optional().default(10),
    types: z.array(z.enum(['papers', 'gaps', 'users', 'trending'])).optional(),
    exclude: z.string().optional(),
});

router.get('/', requireAuth, requireFeature('recommendations'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = RecommendationsSchema.safeParse(req.query);
        if (!parsed.success) {
            res.status(400).json({ error: 'Invalid parameters', details: parsed.error.issues });
            return;
        }

        const { limit, types, exclude } = parsed.data;
        const excludeIds = exclude ? exclude.split(',') : [];

        const recommendations = await getRecommendations({
            userId: req.user!.userId,
            limit,
            types: types || ['papers', 'gaps', 'users', 'trending'],
            excludeIds,
        });

        res.json(recommendations);
    } catch (error) {
        console.error('[Recommendations] Error:', error);
        res.status(500).json({ error: 'Failed to get recommendations' });
    }
});

// ============================================================================
// GET /recommendations/trending — Get trending gaps
// ============================================================================

router.get('/trending', async (_req: Request, res: Response): Promise<void> => {
    try {
        if (!isFeatureEnabled('enableCommunity')) {
            res.status(404).json({ error: 'Feature not available' });
            return;
        }

        const trending = await getTrendingGaps(20);
        res.json({ trending });
    } catch (error) {
        console.error('[Recommendations] Trending error:', error);
        res.status(500).json({ error: 'Failed to get trending gaps' });
    }
});

// ============================================================================
// GET /recommendations/discover — Discover new papers
// ============================================================================

router.get('/discover', requireAuth, requireFeature('recommendations'), async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        
        const discovery = await discoverPapersForUser(req.user!.userId, limit);
        res.json({ discovery });
    } catch (error) {
        console.error('[Recommendations] Discovery error:', error);
        res.status(500).json({ error: 'Failed to discover papers' });
    }
});

// ============================================================================
// GET /recommendations/config — Get public config for recommendations
// ============================================================================

router.get('/config', async (_req: Request, res: Response): Promise<void> => {
    try {
        const publicConfigs = await getPublicConfigs();
        
        res.json({
            recommendationsEnabled: isFeatureEnabled('enableRecommendations'),
            communityEnabled: isFeatureEnabled('enableCommunity'),
            gapTypes: publicConfigs.gapTypes || ['data', 'compute', 'evaluation', 'theory', 'deployment', 'methodology'],
            impactLevels: publicConfigs.impactLevels || ['low', 'medium', 'high'],
            difficultyLevels: publicConfigs.difficultyLevels || ['low', 'medium', 'high'],
        });
    } catch (error) {
        console.error('[Recommendations] Config error:', error);
        res.status(500).json({ error: 'Failed to get config' });
    }
});

export default router;
