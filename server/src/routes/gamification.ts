// ============================================================================
// Gamification Routes
// XP, levels, achievements, streaks, and badges
// ============================================================================

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query, transaction } from '../db/client.js';

const router = Router();

// ============================================================================
// Achievement Definitions
// ============================================================================

const ACHIEVEMENT_DEFS = [
    // Paper milestones
    { id: 'first_paper', name: 'First Steps', description: 'Analyze your first paper', tier: 'bronze', xp: 50 },
    { id: 'papers_10', name: 'Literature Explorer', description: 'Analyze 10 papers', tier: 'silver', xp: 200 },
    { id: 'papers_50', name: 'Research Scholar', description: 'Analyze 50 papers', tier: 'gold', xp: 500 },
    { id: 'papers_100', name: 'Academic Authority', description: 'Analyze 100 papers', tier: 'platinum', xp: 1000 },

    // Gap milestones
    { id: 'first_gap', name: 'Gap Spotter', description: 'Discover your first research gap', tier: 'bronze', xp: 50 },
    { id: 'gaps_25', name: 'Gap Detective', description: 'Discover 25 research gaps', tier: 'silver', xp: 200 },
    { id: 'gaps_100', name: 'Gap Hunter', description: 'Discover 100 research gaps', tier: 'gold', xp: 500 },
    { id: 'gaps_500', name: 'Gap Master', description: 'Discover 500 research gaps', tier: 'platinum', xp: 1000 },

    // Community
    { id: 'first_share', name: 'Community Member', description: 'Share your first gap with the community', tier: 'bronze', xp: 75 },
    { id: 'upvotes_10', name: 'Rising Star', description: 'Receive 10 community upvotes', tier: 'silver', xp: 200 },
    { id: 'upvotes_100', name: 'Community Leader', description: 'Receive 100 community upvotes', tier: 'gold', xp: 500 },
    { id: 'followers_10', name: 'Thought Leader', description: 'Get 10 followers', tier: 'silver', xp: 300 },

    // Streaks
    { id: 'streak_7', name: 'Week Warrior', description: 'Maintain a 7-day research streak', tier: 'silver', xp: 150 },
    { id: 'streak_30', name: 'Monthly Marathoner', description: 'Maintain a 30-day research streak', tier: 'gold', xp: 500 },
    { id: 'streak_100', name: 'Research Machine', description: 'Maintain a 100-day research streak', tier: 'platinum', xp: 1500 },

    // Special
    { id: 'first_resolved', name: 'Problem Solver', description: 'Resolve your first research gap', tier: 'bronze', xp: 100 },
    { id: 'high_impact_10', name: 'High Impact Researcher', description: 'Find 10 high-impact gaps', tier: 'gold', xp: 400 },
    { id: 'multi_venue', name: 'Cross-Disciplinary', description: 'Analyze papers from 5+ venues', tier: 'silver', xp: 250 },
    { id: 'night_owl', name: 'Night Owl', description: 'Analyze a paper between midnight and 5 AM', tier: 'bronze', xp: 50 },
] as const;

// Level thresholds
function getLevel(xp: number): { level: number; title: string; nextLevelXp: number } {
    const levels = [
        { level: 1, title: 'Novice Researcher', threshold: 0 },
        { level: 2, title: 'Junior Analyst', threshold: 100 },
        { level: 3, title: 'Research Associate', threshold: 300 },
        { level: 4, title: 'Gap Explorer', threshold: 600 },
        { level: 5, title: 'Senior Analyst', threshold: 1000 },
        { level: 6, title: 'Research Fellow', threshold: 1600 },
        { level: 7, title: 'Principal Researcher', threshold: 2500 },
        { level: 8, title: 'Gap Architect', threshold: 4000 },
        { level: 9, title: 'Research Director', threshold: 6000 },
        { level: 10, title: 'Chief Scientist', threshold: 10000 },
    ];

    let current = levels[0];
    for (const l of levels) {
        if (xp >= l.threshold) current = l;
        else break;
    }

    const nextLevel = levels.find(l => l.threshold > xp);
    return {
        level: current.level,
        title: current.title,
        nextLevelXp: nextLevel?.threshold || current.threshold,
    };
}

// ============================================================================
// GET /gamification/profile — Get XP, level, streak, achievements
// ============================================================================

router.get('/profile', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const [xpResult, achievementsResult] = await Promise.all([
            query(`SELECT * FROM user_xp WHERE user_id = $1`, [userId]),
            query(
                `SELECT achievement_id, name, description, tier, unlocked_at
                 FROM achievements
                 WHERE user_id = $1
                 ORDER BY unlocked_at DESC`,
                [userId]
            ),
        ]);

        const xp = xpResult.rows[0] || {
            total_xp: 0, current_streak: 0, longest_streak: 0,
            papers_analyzed: 0, gaps_found: 0, comments_made: 0, collaborations: 0,
        };

        const levelInfo = getLevel(xp.total_xp || 0);
        const unlockedAchievements = achievementsResult.rows;
        const allAchievements = ACHIEVEMENT_DEFS.map(def => ({
            ...def,
            unlocked: unlockedAchievements.some(a => a.achievement_id === def.id),
            unlockedAt: unlockedAchievements.find(a => a.achievement_id === def.id)?.unlocked_at || null,
        }));

        res.json({
            xp: xp.total_xp || 0,
            level: levelInfo.level,
            title: levelInfo.title,
            nextLevelXp: levelInfo.nextLevelXp,
            progressToNextLevel: levelInfo.nextLevelXp > 0
                ? Math.round(((xp.total_xp || 0) / levelInfo.nextLevelXp) * 100)
                : 100,
            streak: {
                current: xp.current_streak || 0,
                longest: xp.longest_streak || 0,
                lastActivityDate: xp.last_activity_date,
            },
            stats: {
                papersAnalyzed: xp.papers_analyzed || 0,
                gapsFound: xp.gaps_found || 0,
                commentsMade: xp.comments_made || 0,
                collaborations: xp.collaborations || 0,
            },
            achievements: allAchievements,
            unlockedCount: unlockedAchievements.length,
            totalAchievements: ACHIEVEMENT_DEFS.length,
        });
    } catch (error) {
        console.error('[Gamification] Profile error:', error);
        res.status(500).json({ error: 'Failed to fetch gamification profile' });
    }
});

// ============================================================================
// POST /gamification/check-achievements — Auto-check and award achievements
// ============================================================================

router.post('/check-achievements', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const newlyUnlocked: { id: string; name: string; tier: string; xp: number }[] = [];

        await transaction(async (client) => {
            // Fetch current stats
            const stats = await client.query(
                `SELECT 
                    (SELECT COUNT(*) FROM papers WHERE user_id = $1) as paper_count,
                    (SELECT COUNT(*) FROM gaps WHERE user_id = $1) as gap_count,
                    (SELECT COUNT(*) FROM public_gaps WHERE user_id = $1) as shared_count,
                    (SELECT COUNT(*) FROM gaps WHERE user_id = $1 AND is_resolved = TRUE) as resolved_count,
                    (SELECT COUNT(*) FROM gaps WHERE user_id = $1 AND impact_score = 'high') as high_impact_count,
                    (SELECT COUNT(DISTINCT venue) FROM papers WHERE user_id = $1 AND venue IS NOT NULL) as venue_count,
                    (SELECT COALESCE(SUM(upvotes), 0) FROM public_gaps WHERE user_id = $1) as total_upvotes,
                    (SELECT COUNT(*) FROM user_follows WHERE following_id = $1) as follower_count,
                    (SELECT current_streak FROM user_xp WHERE user_id = $1) as current_streak`,
                [userId]
            );

            const s = stats.rows[0];
            const checks: { id: string; condition: boolean }[] = [
                { id: 'first_paper', condition: parseInt(s.paper_count) >= 1 },
                { id: 'papers_10', condition: parseInt(s.paper_count) >= 10 },
                { id: 'papers_50', condition: parseInt(s.paper_count) >= 50 },
                { id: 'papers_100', condition: parseInt(s.paper_count) >= 100 },
                { id: 'first_gap', condition: parseInt(s.gap_count) >= 1 },
                { id: 'gaps_25', condition: parseInt(s.gap_count) >= 25 },
                { id: 'gaps_100', condition: parseInt(s.gap_count) >= 100 },
                { id: 'gaps_500', condition: parseInt(s.gap_count) >= 500 },
                { id: 'first_share', condition: parseInt(s.shared_count) >= 1 },
                { id: 'upvotes_10', condition: parseInt(s.total_upvotes) >= 10 },
                { id: 'upvotes_100', condition: parseInt(s.total_upvotes) >= 100 },
                { id: 'followers_10', condition: parseInt(s.follower_count) >= 10 },
                { id: 'first_resolved', condition: parseInt(s.resolved_count) >= 1 },
                { id: 'high_impact_10', condition: parseInt(s.high_impact_count) >= 10 },
                { id: 'multi_venue', condition: parseInt(s.venue_count) >= 5 },
                { id: 'streak_7', condition: parseInt(s.current_streak || '0') >= 7 },
                { id: 'streak_30', condition: parseInt(s.current_streak || '0') >= 30 },
                { id: 'streak_100', condition: parseInt(s.current_streak || '0') >= 100 },
            ];

            for (const check of checks) {
                if (!check.condition) continue;

                const def = ACHIEVEMENT_DEFS.find(d => d.id === check.id);
                if (!def) continue;

                // Check if already unlocked
                const existing = await client.query(
                    `SELECT id FROM achievements WHERE user_id = $1 AND achievement_id = $2`,
                    [userId, check.id]
                );

                if (existing.rows.length === 0) {
                    // Award achievement
                    await client.query(
                        `INSERT INTO achievements (user_id, achievement_id, name, description, tier)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [userId, def.id, def.name, def.description, def.tier]
                    );

                    // Award XP
                    await client.query(
                        `UPDATE user_xp SET total_xp = total_xp + $1, updated_at = NOW() WHERE user_id = $2`,
                        [def.xp, userId]
                    );

                    newlyUnlocked.push({ id: def.id, name: def.name, tier: def.tier, xp: def.xp });
                }
            }
        });

        res.json({
            newlyUnlocked,
            message: newlyUnlocked.length > 0
                ? `🏆 You unlocked ${newlyUnlocked.length} new achievement(s)!`
                : 'No new achievements unlocked.',
        });
    } catch (error) {
        console.error('[Gamification] Check achievements error:', error);
        res.status(500).json({ error: 'Failed to check achievements' });
    }
});

// ============================================================================
// POST /gamification/update-streak — Update daily streak
// ============================================================================

router.post('/update-streak', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await transaction(async (client) => {
            const xpResult = await client.query(
                `SELECT * FROM user_xp WHERE user_id = $1`,
                [userId]
            );

            if (xpResult.rows.length === 0) {
                // Initialize XP record
                await client.query(
                    `INSERT INTO user_xp (user_id, current_streak, longest_streak, last_activity_date)
                     VALUES ($1, 1, 1, CURRENT_DATE)
                     ON CONFLICT (user_id) DO NOTHING`,
                    [userId]
                );
                return { currentStreak: 1, longestStreak: 1, streakBonus: 0 };
            }

            const xp = xpResult.rows[0];
            const today = new Date().toISOString().split('T')[0];
            const lastActivity = xp.last_activity_date
                ? new Date(xp.last_activity_date).toISOString().split('T')[0]
                : null;

            if (lastActivity === today) {
                // Already logged today
                return {
                    currentStreak: xp.current_streak,
                    longestStreak: xp.longest_streak,
                    streakBonus: 0,
                    alreadyLoggedToday: true,
                };
            }

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            let newStreak: number;
            let streakBonus = 0;

            if (lastActivity === yesterdayStr) {
                // Continue streak
                newStreak = (xp.current_streak || 0) + 1;
                // Bonus XP for streaks (2 XP per day of streak, capped at 50)
                streakBonus = Math.min(newStreak * 2, 50);
            } else {
                // Streak broken, reset
                newStreak = 1;
            }

            const newLongest = Math.max(newStreak, xp.longest_streak || 0);

            await client.query(
                `UPDATE user_xp 
                 SET current_streak = $1, 
                     longest_streak = $2, 
                     last_activity_date = CURRENT_DATE,
                     total_xp = total_xp + $3,
                     updated_at = NOW()
                 WHERE user_id = $4`,
                [newStreak, newLongest, streakBonus, userId]
            );

            return { currentStreak: newStreak, longestStreak: newLongest, streakBonus };
        });

        res.json(result);
    } catch (error) {
        console.error('[Gamification] Update streak error:', error);
        res.status(500).json({ error: 'Failed to update streak' });
    }
});

// ============================================================================
// GET /gamification/leaderboard — Global XP leaderboard
// ============================================================================

router.get('/leaderboard', async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const sortBy = (req.query.sortBy as string) || 'xp'; // xp, streak, gaps

        let orderColumn: string;
        switch (sortBy) {
            case 'streak': orderColumn = 'ux.current_streak'; break;
            case 'gaps': orderColumn = 'ux.gaps_found'; break;
            default: orderColumn = 'ux.total_xp'; break;
        }

        const result = await query(
            `SELECT ux.total_xp, ux.level, ux.current_streak, ux.longest_streak,
                    ux.papers_analyzed, ux.gaps_found, ux.comments_made,
                    u.name, u.avatar,
                    up.institution, up.bio,
                    (SELECT COUNT(*) FROM achievements WHERE user_id = u.id) as achievement_count
             FROM user_xp ux
             JOIN users u ON u.id = ux.user_id
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE up.is_public IS NOT FALSE
             ORDER BY ${orderColumn} DESC
             LIMIT $1`,
            [limit]
        );

        // Add rank numbers
        const leaderboard = result.rows.map((row, i) => ({
            rank: i + 1,
            ...row,
            levelInfo: getLevel(row.total_xp || 0),
        }));

        res.json({ leaderboard, sortBy });
    } catch (error) {
        console.error('[Gamification] Leaderboard error:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

export default router;
