// ============================================================================
// Feature Gates — Open-core feature gating by subscription tier
// Defines which features each tier can access and per-tier usage quotas
// ============================================================================

// ── Tier Definitions ─────────────────────────────────────────────────────────

export type Tier = 'free' | 'pro' | 'team' | 'enterprise';

export type Feature =
    // Free tier features
    | 'basic_search'
    | 'basic_gap_extraction'
    | 'collections'
    | 'basic_export'
    | 'research_alerts'
    | 'latest_papers'
    | 'bookmarks'
    | 'annotations'
    | 'gamification'
    | 'community'
    | 'chat_basic'
    // Pro tier features
    | 'unlimited_papers'
    | 'advanced_gap_analysis'
    | 'knowledge_graph'
    | 'api_access'
    | 'all_exports'
    | 'priority_support'
    | 'recommendations'
    | 'ai_assistant'
    | 'impact_prediction'
    | 'competitor_tracking'
    | 'grant_matching'
    | 'advanced_analytics'
    | 'chat_unlimited'
    // Team tier features
    | 'shared_collections'
    | 'team_workflows'
    | 'organizations'
    | 'webhooks'
    | 'team_management'
    | 'team_analytics'
    // Enterprise tier features
    | 'sso'
    | 'audit_logs'
    | 'custom_deployment'
    | 'sla'
    | 'dedicated_support'
    | 'dlp_filters'
    | 'ip_whitelist'
    | 'custom_integrations';

// ── Feature → Minimum Tier Mapping ───────────────────────────────────────────

const FEATURE_MIN_TIER: Record<Feature, Tier> = {
    // Free
    basic_search: 'free',
    basic_gap_extraction: 'free',
    collections: 'free',
    basic_export: 'free',
    research_alerts: 'free',
    latest_papers: 'free',
    bookmarks: 'free',
    annotations: 'free',
    gamification: 'free',
    community: 'free',
    chat_basic: 'free',

    // Pro
    unlimited_papers: 'pro',
    advanced_gap_analysis: 'pro',
    knowledge_graph: 'pro',
    api_access: 'pro',
    all_exports: 'pro',
    priority_support: 'pro',
    recommendations: 'pro',
    ai_assistant: 'pro',
    impact_prediction: 'pro',
    competitor_tracking: 'pro',
    grant_matching: 'pro',
    advanced_analytics: 'pro',
    chat_unlimited: 'pro',

    // Team
    shared_collections: 'team',
    team_workflows: 'team',
    organizations: 'team',
    webhooks: 'team',
    team_management: 'team',
    team_analytics: 'team',

    // Enterprise
    sso: 'enterprise',
    audit_logs: 'enterprise',
    custom_deployment: 'enterprise',
    sla: 'enterprise',
    dedicated_support: 'enterprise',
    dlp_filters: 'enterprise',
    ip_whitelist: 'enterprise',
    custom_integrations: 'enterprise',
};

// ── Tier Ordering (higher index = more access) ──────────────────────────────

const TIER_ORDER: Tier[] = ['free', 'pro', 'team', 'enterprise'];

function tierIndex(tier: Tier): number {
    return TIER_ORDER.indexOf(tier);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Check if a given tier has access to a feature.
 */
export function tierHasFeature(tier: Tier, feature: Feature): boolean {
    const requiredTier = FEATURE_MIN_TIER[feature];
    return tierIndex(tier) >= tierIndex(requiredTier);
}

/**
 * Get the minimum tier required for a feature.
 */
export function requiredTierForFeature(feature: Feature): Tier {
    return FEATURE_MIN_TIER[feature];
}

/**
 * Get all features available for a tier (inclusive of lower tiers).
 */
export function featuresForTier(tier: Tier): Feature[] {
    const maxIdx = tierIndex(tier);
    return (Object.entries(FEATURE_MIN_TIER) as [Feature, Tier][])
        .filter(([, minTier]) => tierIndex(minTier) <= maxIdx)
        .map(([feature]) => feature);
}

/**
 * Get features NOT available for a tier (requiring upgrade).
 */
export function featuresLockedForTier(tier: Tier): { feature: Feature; requiredTier: Tier }[] {
    const maxIdx = tierIndex(tier);
    return (Object.entries(FEATURE_MIN_TIER) as [Feature, Tier][])
        .filter(([, minTier]) => tierIndex(minTier) > maxIdx)
        .map(([feature, requiredTier]) => ({ feature, requiredTier }));
}

// ── Usage Quotas ─────────────────────────────────────────────────────────────

export interface TierQuota {
    papersPerMonth: number;      // -1 = unlimited
    gapExtractionsPerMonth: number; // -1 = unlimited
    apiCallsPerDay: number;      // -1 = unlimited
    collections: number;         // -1 = unlimited
    exportsPerMonth: number;     // -1 = unlimited
    chatMessagesPerMonth: number; // -1 = unlimited
    workflows: number;           // -1 = unlimited
    alerts: number;              // -1 = unlimited
}

export const TIER_QUOTAS: Record<Tier, TierQuota> = {
    free: {
        papersPerMonth: 50,
        gapExtractionsPerMonth: 100,
        apiCallsPerDay: 10,
        collections: 5,
        exportsPerMonth: 10,
        chatMessagesPerMonth: 20,
        workflows: 2,
        alerts: 3,
    },
    pro: {
        papersPerMonth: 1000,
        gapExtractionsPerMonth: 1000,
        apiCallsPerDay: 10000,
        collections: 50,
        exportsPerMonth: 200,
        chatMessagesPerMonth: 1000,
        workflows: 20,
        alerts: 20,
    },
    team: {
        papersPerMonth: -1,
        gapExtractionsPerMonth: -1,
        apiCallsPerDay: 100000,
        collections: -1,
        exportsPerMonth: -1,
        chatMessagesPerMonth: -1,
        workflows: -1,
        alerts: -1,
    },
    enterprise: {
        papersPerMonth: -1,
        gapExtractionsPerMonth: -1,
        apiCallsPerDay: -1,
        collections: -1,
        exportsPerMonth: -1,
        chatMessagesPerMonth: -1,
        workflows: -1,
        alerts: -1,
    },
};

/**
 * Get the quota for a specific resource at a given tier.
 */
export function getQuota(tier: Tier, resource: keyof TierQuota): number {
    return TIER_QUOTAS[tier][resource];
}

/**
 * Check if usage is within quota. Returns { allowed, remaining, limit }.
 */
export function checkQuota(
    tier: Tier,
    resource: keyof TierQuota,
    currentUsage: number
): { allowed: boolean; remaining: number; limit: number } {
    const limit = TIER_QUOTAS[tier][resource];
    if (limit === -1) {
        return { allowed: true, remaining: -1, limit: -1 };
    }
    const remaining = Math.max(0, limit - currentUsage);
    return { allowed: currentUsage < limit, remaining, limit };
}

// ── Rate Limits per Tier ─────────────────────────────────────────────────────

export interface TierRateLimit {
    requestsPerMinute: number;
    burstLimit: number;
}

export const TIER_RATE_LIMITS: Record<Tier, TierRateLimit> = {
    free:     { requestsPerMinute: 30,  burstLimit: 10 },
    pro:      { requestsPerMinute: 120, burstLimit: 50 },
    team:     { requestsPerMinute: 300, burstLimit: 100 },
    enterprise: { requestsPerMinute: 600, burstLimit: 200 },
};

// ── Feature Display Metadata ─────────────────────────────────────────────────

export interface FeatureMeta {
    name: string;
    description: string;
    tier: Tier;
}

export const FEATURE_METADATA: Record<Feature, FeatureMeta> = {
    basic_search:            { name: 'Basic Search',            description: 'Search papers and gaps',                          tier: 'free' },
    basic_gap_extraction:    { name: 'Gap Extraction',          description: 'Extract research gaps from papers',              tier: 'free' },
    collections:             { name: 'Collections',             description: 'Organize papers and gaps into collections',      tier: 'free' },
    basic_export:            { name: 'Basic Export',            description: 'Export as JSON or CSV',                          tier: 'free' },
    research_alerts:         { name: 'Research Alerts',         description: 'Get notified about new papers',                  tier: 'free' },
    latest_papers:           { name: 'Latest Papers',           description: 'Browse latest papers from top venues',           tier: 'free' },
    bookmarks:               { name: 'Bookmarks',               description: 'Save papers and gaps for later',                 tier: 'free' },
    annotations:             { name: 'Annotations',             description: 'Highlight and annotate papers',                  tier: 'free' },
    gamification:            { name: 'Gamification',            description: 'Earn XP and achievements',                       tier: 'free' },
    community:               { name: 'Community',               description: 'Share and vote on public gaps',                  tier: 'free' },
    chat_basic:              { name: 'Basic Chat',              description: 'Limited AI chat with papers',                    tier: 'free' },
    unlimited_papers:        { name: 'Unlimited Papers',        description: 'Analyze up to 1000 papers/month',               tier: 'pro' },
    advanced_gap_analysis:   { name: 'Advanced Gap Analysis',   description: 'Deep gap classification and scoring',           tier: 'pro' },
    knowledge_graph:         { name: 'Knowledge Graph',         description: 'Visualize research connections',                 tier: 'pro' },
    api_access:              { name: 'API Access',              description: 'Programmatic access to your data',               tier: 'pro' },
    all_exports:             { name: 'All Exports',             description: 'PDF, Markdown, and API export formats',         tier: 'pro' },
    priority_support:        { name: 'Priority Support',        description: 'Faster response from our team',                 tier: 'pro' },
    recommendations:         { name: 'Recommendations',         description: 'AI-powered paper recommendations',              tier: 'pro' },
    ai_assistant:            { name: 'AI Assistant',            description: 'Full AI research assistant',                    tier: 'pro' },
    impact_prediction:       { name: 'Impact Prediction',       description: 'Predict research impact scores',                tier: 'pro' },
    competitor_tracking:     { name: 'Competitor Tracking',     description: 'Track competitor research activity',             tier: 'pro' },
    grant_matching:          { name: 'Grant Matching',          description: 'Find relevant grant opportunities',              tier: 'pro' },
    advanced_analytics:      { name: 'Advanced Analytics',      description: 'Detailed usage and research analytics',         tier: 'pro' },
    chat_unlimited:          { name: 'Unlimited Chat',          description: 'Unlimited AI chat messages',                    tier: 'pro' },
    shared_collections:      { name: 'Shared Collections',      description: 'Share collections with teammates',              tier: 'team' },
    team_workflows:          { name: 'Team Workflows',          description: 'Automated research workflows',                  tier: 'team' },
    organizations:           { name: 'Organizations',           description: 'Institutional dashboards and teams',            tier: 'team' },
    webhooks:                { name: 'Webhooks',                description: 'Event notifications to external services',      tier: 'team' },
    team_management:         { name: 'Team Management',         description: 'Manage team members and roles',                 tier: 'team' },
    team_analytics:          { name: 'Team Analytics',          description: 'Aggregated team research metrics',              tier: 'team' },
    sso:                     { name: 'SSO',                     description: 'Single sign-on with your identity provider',    tier: 'enterprise' },
    audit_logs:              { name: 'Audit Logs',              description: 'Track all user actions for compliance',         tier: 'enterprise' },
    custom_deployment:       { name: 'Custom Deployment',       description: 'Deploy on your own infrastructure',             tier: 'enterprise' },
    sla:                     { name: 'SLA',                     description: 'Guaranteed uptime and response times',          tier: 'enterprise' },
    dedicated_support:       { name: 'Dedicated Support',       description: 'Direct line to our engineering team',           tier: 'enterprise' },
    dlp_filters:             { name: 'DLP Filters',             description: 'Data loss prevention policies',                tier: 'enterprise' },
    ip_whitelist:            { name: 'IP Whitelist',            description: 'Restrict access by IP address',                 tier: 'enterprise' },
    custom_integrations:     { name: 'Custom Integrations',     description: 'Build custom integrations with your stack',     tier: 'enterprise' },
};

// ── Tier Metadata ────────────────────────────────────────────────────────────

export interface TierMeta {
    name: string;
    displayName: string;
    price: string;
    pricePerMonth: number;
    description: string;
}

export const TIER_METADATA: Record<Tier, TierMeta> = {
    free: {
        name: 'free',
        displayName: 'Starter',
        price: '$0',
        pricePerMonth: 0,
        description: 'For individual researchers getting started',
    },
    pro: {
        name: 'pro',
        displayName: 'Pro',
        price: '$29',
        pricePerMonth: 29,
        description: 'For serious researchers who need more power',
    },
    team: {
        name: 'team',
        displayName: 'Team',
        price: '$99',
        pricePerMonth: 99,
        description: 'For research teams and labs',
    },
    enterprise: {
        name: 'enterprise',
        displayName: 'Enterprise',
        price: 'Custom',
        pricePerMonth: -1,
        description: 'For organizations with custom requirements',
    },
};
