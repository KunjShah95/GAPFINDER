// ============================================================================
// Recommendation Engine
// Multi-faceted recommendation system for papers, gaps, and users
// ============================================================================

import { query } from '../db/client.js';
import { isFeatureEnabled } from './config.js';

// ============================================================================
// Types
// ============================================================================

export type RecommendationType = 'papers' | 'gaps' | 'users' | 'collections' | 'trending' | 'discovery';

export interface RecommendationRequest {
    userId: string;
    limit?: number;
    types?: RecommendationType[];
    excludeIds?: string[];
}

export interface PaperRecommendation {
    id: string;
    title: string;
    abstract: string;
    venue: string;
    year: number;
    authors: string[];
    citationCount: number;
    relevanceScore: number;
    reason: string;
}

export interface GapRecommendation {
    id: string;
    problem: string;
    type: string;
    impactScore: string;
    difficulty: string;
    upvotes: number;
    paperTitle: string;
    relevanceScore: number;
    reason: string;
}

export interface UserRecommendation {
    id: string;
    name: string;
    avatar: string | null;
    bio: string | null;
    institution: string | null;
    totalSharedGaps: number;
    totalUpvotesReceived: number;
    relevanceScore: number;
    reason: string;
}

export interface TrendingGap {
    id: string;
    problem: string;
    type: string;
    impactScore: string;
    upvotes: number;
    viewCount: number;
    authorName: string;
    createdAt: Date;
}

export interface RecommendedPaper {
    id: string;
    title: string;
    url: string;
    venue: string;
    year: number;
    relevanceScore: number;
    matchType: 'keyword' | 'author' | 'citation' | 'collaborative';
}

// ============================================================================
// USER INTERESTS & PREFERENCES
// ============================================================================

async function getUserInterests(userId: string): Promise<{
    keywords: string[];
    authors: string[];
    venues: string[];
    gapTypes: string[];
}> {
    // Get keywords from user's saved papers and gaps
    const papersResult = await query(`
        SELECT title, abstract, venue, authors 
        FROM papers 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT 50
    `, [userId]);
    
    const gapsResult = await query(`
        SELECT g.problem, g.type, g.assumptions, g.failures
        FROM gaps g
        JOIN papers p ON g.paper_id = p.id
        WHERE g.user_id = $1
        ORDER BY g.created_at DESC
        LIMIT 50
    `, [userId]);
    
    // Extract keywords from titles and abstracts
    const keywordSet = new Set<string>();
    const authorSet = new Set<string>();
    const venueSet = new Set<string>();
    const gapTypeSet = new Set<string>();
    
    for (const paper of papersResult.rows) {
        if (paper.title) {
            const words = extractKeywords(paper.title);
            words.forEach(w => keywordSet.add(w));
        }
        if (paper.abstract) {
            const words = extractKeywords(paper.abstract.slice(0, 500));
            words.forEach(w => keywordSet.add(w));
        }
        if (paper.venue) venueSet.add(paper.venue);
        if (paper.authors && Array.isArray(paper.authors)) {
            paper.authors.forEach((a: string) => authorSet.add(a));
        }
    }
    
    for (const gap of gapsResult.rows) {
        if (gap.problem) {
            const words = extractKeywords(gap.problem);
            words.forEach(w => keywordSet.add(w));
        }
        if (gap.type) gapTypeSet.add(gap.type);
        if (gap.assumptions) gap.assumptions.forEach((a: string) => keywordSet.add(a));
        if (gap.failures) gap.failures.forEach((f: string) => keywordSet.add(f));
    }
    
    return {
        keywords: Array.from(keywordSet).slice(0, 50),
        authors: Array.from(authorSet).slice(0, 20),
        venues: Array.from(venueSet).slice(0, 10),
        gapTypes: Array.from(gapTypeSet),
    };
}

function extractKeywords(text: string): string[] {
    if (!text) return [];
    
    // Common research keywords to look for
    const researchTerms = [
        'neural', 'network', 'transformer', 'attention', 'bert', 'gpt', 'llm',
        'reinforcement', 'learning', 'supervised', 'unsupervised', 'semi-supervised',
        'classification', 'regression', 'clustering', 'dimensionality', 'optimization',
        'vision', 'image', 'nlp', 'text', 'speech', 'audio', 'video', 'multimodal',
        'quantum', 'crypto', 'security', 'privacy', 'federated', 'distributed',
        'graph', 'knowledge', 'reasoning', 'planning', 'decision', 'control',
        'robotics', 'autonomous', 'navigation', 'perception', 'detection', 'segmentation',
        'gan', 'diffusion', '生成', '生成模型', 'stable', 'midjourney',
        'interpretability', 'explainability', 'fairness', 'bias', 'ethics',
        'pre-training', 'fine-tuning', 'transfer', 'domain', 'adaptation',
        'few-shot', 'zero-shot', 'in-context', 'prompt', 'chain-of-thought'
    ];
    
    const textLower = text.toLowerCase();
    const found: string[] = [];
    
    for (const term of researchTerms) {
        if (textLower.includes(term)) {
            found.push(term);
        }
    }
    
    // Also extract significant words (length > 4)
    const words = text.split(/\s+/).filter(w => w.length > 4);
    for (const word of words.slice(0, 20)) {
        const cleaned = word.replace(/[^a-z]/gi, '').toLowerCase();
        if (cleaned.length > 5 && !researchTerms.includes(cleaned)) {
            found.push(cleaned);
        }
    }
    
    return found;
}

// ============================================================================
// CONTENT-BASED RECOMMENDATIONS
// ============================================================================

async function recommendSimilarPapers(
    userId: string, 
    limit: number = 10
): Promise<PaperRecommendation[]> {
    const interests = await getUserInterests(userId);
    
    if (interests.keywords.length === 0) {
        // No history - return trending papers
        return getTrendingPapers(limit);
    }
    
    // Search for papers matching user interests
    const keywordsCondition = interests.keywords.slice(0, 10).map((_, i) => 
        `(title ILIKE $${i + 1} OR abstract ILIKE $${i + 1})`
    ).join(' OR ');
    
    const params = [...interests.keywords.slice(0, 10), userId, limit];
    
    const result = await query(`
        SELECT p.id, p.title, p.abstract, p.venue, p.year, p.authors, p.citation_count,
               ts_rank(p.search_vector, plainto_tsquery('english', $${params.length - 1})) as rank
        FROM papers p
        WHERE p.user_id != $${params.length - 1}
        AND (${keywordsCondition})
        ORDER BY rank DESC, p.citation_count DESC
        LIMIT $${params.length}
    `, params);
    
    return result.rows.map((row, index) => ({
        id: row.id,
        title: row.title,
        abstract: row.abstract,
        venue: row.venue,
        year: row.year,
        authors: row.authors || [],
        citationCount: row.citation_count || 0,
        relevanceScore: Math.max(1 - index * 0.1, 0.3),
        reason: `Matches your research interests in ${interests.keywords.slice(0, 3).join(', ')}`,
    }));
}

async function recommendSimilarGaps(
    userId: string, 
    limit: number = 10
): Promise<GapRecommendation[]> {
    const interests = await getUserInterests(userId);
    
    // Get gaps that match user's gap type preferences
    let typeCondition = '';
    const params: any[] = [userId];
    
    if (interests.gapTypes.length > 0) {
        typeCondition = `AND g.type = ANY($${params.length + 1})`;
        params.push(interests.gapTypes);
    }
    
    params.push(limit);
    
    const result = await query(`
        SELECT g.id, g.problem, g.type, g.impact_score, g.difficulty, g.upvotes,
               p.title as paper_title,
               ts_rank(g.search_vector, plainto_tsquery('english', $${params.length - 1})) as rank
        FROM gaps g
        JOIN papers p ON g.paper_id = p.id
        WHERE g.user_id != $1
        AND g.is_resolved = FALSE
        ${typeCondition}
        ORDER BY rank DESC, g.upvotes DESC
        LIMIT $${params.length}
    `, params);
    
    return result.rows.map((row, index) => ({
        id: row.id,
        problem: row.problem,
        type: row.type,
        impactScore: row.impact_score,
        difficulty: row.difficulty,
        upvotes: row.upvotes || 0,
        paperTitle: row.paper_title,
        relevanceScore: Math.max(1 - index * 0.1, 0.3),
        reason: `Similar to gaps you've saved (${row.type})`,
    }));
}

// ============================================================================
// COLLABORATIVE FILTERING
// ============================================================================

async function getCollaborativeRecommendations(
    userId: string, 
    limit: number = 10
): Promise<{
    papers: PaperRecommendation[];
    gaps: GapRecommendation[];
}> {
    // Find users with similar interests
    const similarUsersResult = await query(`
        SELECT DISTINCT g2.user_id as similar_user,
               COUNT(g2.id) as common_gaps
        FROM gaps g1
        JOIN gaps g2 ON g1.type = g2.type 
            AND g1.impact_score = g2.impact_score
        WHERE g1.user_id = $1
        AND g2.user_id != $1
        GROUP BY g2.user_id
        ORDER BY common_gaps DESC
        LIMIT 20
    `, [userId]);
    
    const similarUserIds = similarUsersResult.rows.map(r => r.similar_user);
    
    if (similarUserIds.length === 0) {
        return { papers: [], gaps: [] };
    }
    
    // Get papers from similar users
    const papersResult = await query(`
        SELECT p.id, p.title, p.abstract, p.venue, p.year, p.authors, p.citation_count,
               COUNT(*) as user_count
        FROM papers p
        WHERE p.user_id = ANY($1)
        GROUP BY p.id
        ORDER BY user_count DESC, p.citation_count DESC
        LIMIT $2
    `, [similarUserIds, Math.floor(limit / 2)]);
    
    // Get gaps from similar users
    const gapsResult = await query(`
        SELECT g.id, g.problem, g.type, g.impact_score, g.difficulty, g.upvotes,
               p.title as paper_title,
               COUNT(*) as user_count
        FROM gaps g
        JOIN papers p ON g.paper_id = p.id
        WHERE g.user_id = ANY($1)
        AND g.is_resolved = FALSE
        GROUP BY g.id, p.title
        ORDER BY user_count DESC, g.upvotes DESC
        LIMIT $2
    `, [similarUserIds, Math.floor(limit / 2)]);
    
    return {
        papers: papersResult.rows.map(row => ({
            id: row.id,
            title: row.title,
            abstract: row.abstract,
            venue: row.venue,
            year: row.year,
            authors: row.authors || [],
            citationCount: row.citation_count || 0,
            relevanceScore: row.user_count / similarUserIds.length,
            reason: 'Popular among researchers with similar interests',
        })),
        gaps: gapsResult.rows.map(row => ({
            id: row.id,
            problem: row.problem,
            type: row.type,
            impactScore: row.impact_score,
            difficulty: row.difficulty,
            upvotes: row.upvotes || 0,
            paperTitle: row.paper_title,
            relevanceScore: row.user_count / similarUserIds.length,
            reason: 'Trending among similar researchers',
        })),
    };
}

// ============================================================================
// TRENDING & POPULAR
// ============================================================================

async function getTrendingPapers(limit: number = 10): Promise<PaperRecommendation[]> {
    // Papers with most citations in recent timeframe
    const result = await query(`
        SELECT p.id, p.title, p.abstract, p.venue, p.year, p.authors, p.citation_count
        FROM papers p
        ORDER BY p.citation_count DESC, p.created_at DESC
        LIMIT $1
    `, [limit]);
    
    return result.rows.map((row, index) => ({
        id: row.id,
        title: row.title,
        abstract: row.abstract,
        venue: row.venue,
        year: row.year,
        authors: row.authors || [],
        citationCount: row.citation_count || 0,
        relevanceScore: Math.max(1 - index * 0.1, 0.5),
        reason: 'Highly cited in the research community',
    }));
}

async function getTrendingGaps(limit: number = 10): Promise<TrendingGap[]> {
    const result = await query(`
        SELECT g.id, g.problem, g.type, g.impact_score, g.upvotes, 
               pg.view_count, u.name as author_name, g.created_at
        FROM gaps g
        JOIN papers p ON g.paper_id = p.id
        JOIN users u ON g.user_id = u.id
        LEFT JOIN public_gaps pg ON g.id = pg.gap_id
        WHERE g.is_resolved = FALSE
        ORDER BY (g.upvotes + COALESCE(pg.view_count, 0)) DESC, g.created_at DESC
        LIMIT $1
    `, [limit]);
    
    return result.rows.map(row => ({
        id: row.id,
        problem: row.problem,
        type: row.type,
        impactScore: row.impact_score,
        upvotes: row.upvotes || 0,
        viewCount: row.view_count || 0,
        authorName: row.author_name,
        createdAt: row.created_at,
    }));
}

// ============================================================================
// RESEARCHERS TO FOLLOW
// ============================================================================

async function getRecommendedResearchers(
    userId: string, 
    limit: number = 10
): Promise<UserRecommendation[]> {
    // Get user's existing follows
    const followsResult = await query(`
        SELECT following_id FROM user_follows WHERE follower_id = $1
    `, [userId]);
    
    const existingFollows = followsResult.rows.map(r => r.following_id);
    
    // Find researchers with most contributions
    const result = await query(`
        SELECT u.id, u.name, up.avatar_url, up.bio, up.institution,
               up.total_shared_gaps, up.total_upvotes_received
        FROM users u
        JOIN user_profiles up ON u.id = up.user_id
        WHERE u.id != $1
        AND up.is_public = TRUE
        AND up.total_shared_gaps > 0
        AND u.id != ALL($2)
        ORDER BY up.total_upvotes_received DESC, up.total_shared_gaps DESC
        LIMIT $3
    `, [userId, existingFollows, limit]);
    
    return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        avatar: row.avatar_url,
        bio: row.bio,
        institution: row.institution,
        totalSharedGaps: row.total_shared_gaps || 0,
        totalUpvotesReceived: row.total_upvotes_received || 0,
        relevanceScore: 0.8,
        reason: 'Active contributor in the community',
    }));
}

// ============================================================================
// SMART PAPER DISCOVERY
// ============================================================================

async function discoverPapersForUser(
    userId: string,
    limit: number = 20
): Promise<RecommendedPaper[]> {
    const interests = await getUserInterests(userId);
    const papers: RecommendedPaper[] = [];
    
    // 1. Keyword-based matches
    if (interests.keywords.length > 0) {
        const keywordResult = await query(`
            SELECT p.id, p.title, p.url, p.venue, p.year,
                   ts_rank(p.search_vector, plainto_tsquery('english', $1)) as rank
            FROM papers p
            WHERE p.search_vector @@ plainto_tsquery('english', $1)
            AND p.user_id != $2
            ORDER BY rank DESC
            LIMIT $3
        `, [interests.keywords.slice(0, 5).join(' '), userId, Math.floor(limit / 3)]);
        
        papers.push(...keywordResult.rows.map(row => ({
            id: row.id,
            title: row.title,
            url: row.url,
            venue: row.venue,
            year: row.year,
            relevanceScore: row.rank,
            matchType: 'keyword' as const,
        })));
    }
    
    // 2. Author-based matches
    if (interests.authors.length > 0) {
        const authorResult = await query(`
            SELECT DISTINCT p.id, p.title, p.url, p.venue, p.year
            FROM papers p, unnest(p.authors) as author
            WHERE author = ANY($1)
            AND p.user_id != $2
            ORDER BY p.citation_count DESC
            LIMIT $3
        `, [interests.authors.slice(0, 5), userId, Math.floor(limit / 3)]);
        
        papers.push(...authorResult.rows.map(row => ({
            id: row.id,
            title: row.title,
            url: row.url,
            venue: row.venue,
            year: row.year,
            relevanceScore: 0.8,
            matchType: 'author' as const,
        })));
    }
    
    // 3. Citation-based (papers citing user's saved papers)
    const citationResult = await query(`
        SELECT p.id, p.title, p.url, p.venue, p.year
        FROM papers p
        WHERE p.user_id != $1
        ORDER BY p.citation_count DESC
        LIMIT $2
    `, [userId, Math.floor(limit / 3)]);
    
    papers.push(...citationResult.rows.map(row => ({
        id: row.id,
        title: row.title,
        url: row.url,
        venue: row.venue,
        year: row.year,
        relevanceScore: 0.6,
        matchType: 'citation' as const,
    })));
    
    // Sort by relevance and return
    return papers
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);
}

// ============================================================================
// MAIN RECOMMENDATION FUNCTION
// ============================================================================

export async function getRecommendations(
    request: RecommendationRequest
): Promise<{
    papers?: PaperRecommendation[];
    gaps?: GapRecommendation[];
    researchers?: UserRecommendation[];
    trending?: TrendingGap[];
    discovery?: RecommendedPaper[];
}> {
    const { userId, limit = 10, types = ['papers', 'gaps', 'researchers', 'trending'], excludeIds = [] } = request;
    
    // Check if recommendations are enabled
    if (!isFeatureEnabled('enableRecommendations')) {
        return {};
    }
    
    const result: any = {};
    
    if (types.includes('papers')) {
        try {
            const contentBased = await recommendSimilarPapers(userId, limit);
            const collaborative = await getCollaborativeRecommendations(userId, limit);
            
            // Merge and deduplicate
            const paperMap = new Map();
            [...contentBased, ...collaborative.papers].forEach(p => {
                if (!paperMap.has(p.id)) paperMap.set(p.id, p);
            });
            
            result.papers = Array.from(paperMap.values())
                .filter(p => !excludeIds.includes(p.id))
                .slice(0, limit);
        } catch (error) {
            console.error('[Recommendations] Error getting paper recommendations:', error);
        }
    }
    
    if (types.includes('gaps')) {
        try {
            const contentBased = await recommendSimilarGaps(userId, limit);
            const collaborative = await getCollaborativeRecommendations(userId, limit);
            
            // Merge and deduplicate
            const gapMap = new Map();
            [...contentBased, ...collaborative.gaps].forEach(g => {
                if (!gapMap.has(g.id)) gapMap.set(g.id, g);
            });
            
            result.gaps = Array.from(gapMap.values())
                .filter(g => !excludeIds.includes(g.id))
                .slice(0, limit);
        } catch (error) {
            console.error('[Recommendations] Error getting gap recommendations:', error);
        }
    }
    
    if ((types as RecommendationType[]).includes('users')) {
        try {
            result.researchers = await getRecommendedResearchers(userId, limit);
        } catch (error) {
            console.error('[Recommendations] Error getting researcher recommendations:', error);
        }
    }
    
    if (types.includes('trending')) {
        try {
            result.trending = await getTrendingGaps(limit);
        } catch (error) {
            console.error('[Recommendations] Error getting trending gaps:', error);
        }
    }
    
    // Discovery (for explore page)
    try {
        result.discovery = await discoverPapersForUser(userId, limit);
    } catch (error) {
        console.error('[Recommendations] Error getting paper discovery:', error);
    }
    
    return result;
}

// Export individual functions for specific use cases
export {
    getUserInterests,
    recommendSimilarPapers,
    recommendSimilarGaps,
    getTrendingPapers,
    getTrendingGaps,
    getRecommendedResearchers,
    discoverPapersForUser,
};
