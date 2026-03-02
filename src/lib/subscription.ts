// Subscription and Usage Service for GapMiner SaaS
// Manages user subscriptions, usage tracking, and quota enforcement
// Storage: localStorage (no Firebase dependency)

// ── Timestamp shim ──────────────────────────────────────────────────────────
export class Timestamp {
    seconds: number
    nanoseconds: number

    constructor(seconds: number, nanoseconds = 0) {
        this.seconds = seconds
        this.nanoseconds = nanoseconds
    }

    static now(): Timestamp {
        const ms = Date.now()
        return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1_000_000)
    }

    static fromDate(date: Date): Timestamp {
        return new Timestamp(Math.floor(date.getTime() / 1000))
    }

    toDate(): Date {
        return new Date(this.seconds * 1000)
    }

    toMillis(): number {
        return this.seconds * 1000
    }
}

// ── localStorage helpers ─────────────────────────────────────────────────────
const PREFIX = 'gapminer:sub:'

function ls_read<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(PREFIX + key)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        // Revive plain objects as Timestamp instances
        const revive = (obj: any): any => {
            if (obj && typeof obj === 'object') {
                if ('seconds' in obj && 'nanoseconds' in obj && !('toDate' in obj)) {
                    return new Timestamp(obj.seconds, obj.nanoseconds)
                }
                for (const k of Object.keys(obj)) obj[k] = revive(obj[k])
            }
            return obj
        }
        return revive(parsed) as T
    } catch { return null }
}

function ls_write(key: string, data: any): void {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(data)) } catch { /* quota */ }
}

function makeId(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

// SUBSCRIPTION TIERS
export type SubscriptionTier = "free" | "pro" | "team" | "enterprise"

export interface TierLimits {
    papersPerMonth: number
    gapsPerPaper: number
    collectionsLimit: number
    teamMembers: number
    apiAccess: boolean
    priorityProcessing: boolean
    exportFormats: string[]
    historyRetention: number // days
    // New feature limits
    alertsLimit: number          // max research alerts (-1 = unlimited)
    latestPapersPublishers: number  // how many publisher feeds accessible (-1 = all)
    latestPapersRefresh: boolean    // can manually trigger cron refresh
    chatMessagesPerMonth: number // AI chat messages per month (-1 = unlimited)
    workflowsLimit: number       // max saved automation workflows (-1 = unlimited)
    knowledgeGraphNodes: number  // max nodes in knowledge graph (-1 = unlimited)
    advancedExport: boolean      // PDF / markdown / API export formats
    competitorTracking: boolean  // competitor analysis feature
    grantMatching: boolean       // grant matching feature
    impactPrediction: boolean    // research impact prediction
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
    free: {
        papersPerMonth: 50,
        gapsPerPaper: 10,
        collectionsLimit: 5,
        teamMembers: 1,
        apiAccess: false,
        priorityProcessing: false,
        exportFormats: ["csv"],
        historyRetention: 30,
        alertsLimit: 3,
        latestPapersPublishers: 2,   // arXiv + PubMed only
        latestPapersRefresh: false,
        chatMessagesPerMonth: 20,
        workflowsLimit: 2,
        knowledgeGraphNodes: 100,
        advancedExport: false,
        competitorTracking: false,
        grantMatching: false,
        impactPrediction: false,
    },
    pro: {
        papersPerMonth: 500,
        gapsPerPaper: 50,
        collectionsLimit: 50,
        teamMembers: 1,
        apiAccess: true,
        priorityProcessing: true,
        exportFormats: ["csv", "json", "pdf"],
        historyRetention: 365,
        alertsLimit: 20,
        latestPapersPublishers: 5,   // arXiv, PubMed, CrossRef, bioRxiv, PLOS
        latestPapersRefresh: true,
        chatMessagesPerMonth: 500,
        workflowsLimit: 20,
        knowledgeGraphNodes: 1000,
        advancedExport: true,
        competitorTracking: true,
        grantMatching: true,
        impactPrediction: false,
    },
    team: {
        papersPerMonth: 2000,
        gapsPerPaper: 100,
        collectionsLimit: 200,
        teamMembers: 10,
        apiAccess: true,
        priorityProcessing: true,
        exportFormats: ["csv", "json", "pdf", "markdown"],
        historyRetention: 730,
        alertsLimit: 50,
        latestPapersPublishers: 8,   // all 8 publishers
        latestPapersRefresh: true,
        chatMessagesPerMonth: 2000,
        workflowsLimit: 100,
        knowledgeGraphNodes: 5000,
        advancedExport: true,
        competitorTracking: true,
        grantMatching: true,
        impactPrediction: true,
    },
    enterprise: {
        papersPerMonth: -1, // unlimited
        gapsPerPaper: -1, // unlimited
        collectionsLimit: -1, // unlimited
        teamMembers: -1, // unlimited
        apiAccess: true,
        priorityProcessing: true,
        exportFormats: ["csv", "json", "pdf", "markdown", "api"],
        historyRetention: -1, // unlimited
        alertsLimit: -1,
        latestPapersPublishers: -1,  // all publishers
        latestPapersRefresh: true,
        chatMessagesPerMonth: -1,
        workflowsLimit: -1,
        knowledgeGraphNodes: -1,
        advancedExport: true,
        competitorTracking: true,
        grantMatching: true,
        impactPrediction: true,
    },
}

// SUBSCRIPTION TYPES
export interface Subscription {
    id?: string
    userId: string
    tier: SubscriptionTier
    status: "active" | "canceled" | "past_due" | "trialing"
    trialEndsAt?: Timestamp
    currentPeriodStart: Timestamp
    currentPeriodEnd: Timestamp
    cancelAtPeriodEnd: boolean
    paymentProvider?: "stripe" | "lemonsqueezy"
    externalSubscriptionId?: string
    createdAt: Timestamp
    updatedAt: Timestamp
}

export interface UsageRecord {
    id?: string
    userId: string
    periodStart: Timestamp
    periodEnd: Timestamp
    papersProcessed: number
    gapsExtracted: number
    apiCalls: number
    exportCount: number
    lastUpdated: Timestamp
}

export interface UsageEvent {
    id?: string
    userId: string
    eventType: "paper_crawl" | "gap_extract" | "api_call" | "export" | "assistant_query"
    resourceId?: string
    metadata?: Record<string, any>
    createdAt: Timestamp
}

// ── SUBSCRIPTION MANAGEMENT ─────────────────────────────────────────────────

export async function createSubscription(
    userId: string,
    tier: SubscriptionTier = "free",
    trialDays: number = 14
): Promise<string> {
    const now = Timestamp.now()
    const trialEnd = new Date()
    trialEnd.setDate(trialEnd.getDate() + trialDays)
    const periodEnd = new Date()
    periodEnd.setMonth(periodEnd.getMonth() + 1)

    const id = makeId()
    const subscription: Subscription = {
        id,
        userId,
        tier,
        status: tier === "free" ? "active" : "trialing",
        trialEndsAt: tier !== "free" ? Timestamp.fromDate(trialEnd) : undefined,
        currentPeriodStart: now,
        currentPeriodEnd: Timestamp.fromDate(periodEnd),
        cancelAtPeriodEnd: false,
        createdAt: now,
        updatedAt: now,
    }
    ls_write(`sub:${userId}`, subscription)
    await initializeUsageRecord(userId, now, Timestamp.fromDate(periodEnd))
    return id
}

export async function getSubscription(userId: string): Promise<Subscription | null> {
    return ls_read<Subscription>(`sub:${userId}`) ?? null
}

export async function updateSubscription(
    userId: string,
    updates: Partial<Subscription>
): Promise<void> {
    const existing = await getSubscription(userId)
    if (!existing) return
    ls_write(`sub:${userId}`, { ...existing, ...updates, updatedAt: Timestamp.now() })
}

export async function upgradeSubscription(
    userId: string,
    newTier: SubscriptionTier,
    paymentProvider: "stripe" | "lemonsqueezy",
    externalId: string
): Promise<void> {
    await updateSubscription(userId, {
        tier: newTier,
        status: "active",
        paymentProvider,
        externalSubscriptionId: externalId,
    })
}

export async function cancelSubscription(userId: string): Promise<void> {
    await updateSubscription(userId, { cancelAtPeriodEnd: true })
}

// ── USAGE TRACKING ───────────────────────────────────────────────────────────

async function initializeUsageRecord(
    userId: string,
    periodStart: Timestamp,
    periodEnd: Timestamp
): Promise<string> {
    const id = makeId()
    const usage: UsageRecord = {
        id,
        userId,
        periodStart,
        periodEnd,
        papersProcessed: 0,
        gapsExtracted: 0,
        apiCalls: 0,
        exportCount: 0,
        lastUpdated: Timestamp.now(),
    }
    ls_write(`usage:${userId}`, usage)
    return id
}

export async function getCurrentUsage(userId: string): Promise<UsageRecord | null> {
    const usage = ls_read<UsageRecord>(`usage:${userId}`)
    if (!usage) return null
    // Check period is still valid
    if (usage.periodEnd.toDate() < new Date()) return null
    return usage
}

export async function incrementUsage(
    userId: string,
    field: keyof Pick<UsageRecord, "papersProcessed" | "gapsExtracted" | "apiCalls" | "exportCount">,
    amount: number = 1
): Promise<void> {
    let usage = await getCurrentUsage(userId)
    if (!usage) {
        const sub = await getSubscription(userId)
        if (sub) {
            await initializeUsageRecord(userId, sub.currentPeriodStart, sub.currentPeriodEnd)
            usage = await getCurrentUsage(userId)
        }
        if (!usage) return
    }
    const updated = { ...usage, [field]: (usage[field] as number) + amount, lastUpdated: Timestamp.now() }
    ls_write(`usage:${userId}`, updated)
}

export async function logUsageEvent(
    userId: string,
    eventType: UsageEvent["eventType"],
    _resourceId?: string,
    _metadata?: Record<string, any>
): Promise<void> {
    switch (eventType) {
        case "paper_crawl": await incrementUsage(userId, "papersProcessed"); break
        case "api_call": await incrementUsage(userId, "apiCalls"); break
        case "export": await incrementUsage(userId, "exportCount"); break
    }
}

// QUOTA ENFORCEMENT

export interface QuotaCheck {
    allowed: boolean
    remaining: number
    limit: number
    resetDate: Date
    upgradeRequired: boolean
}

export async function checkQuota(
    userId: string,
    resource: "papers" | "gaps" | "collections" | "api"
): Promise<QuotaCheck> {
    const subscription = await getSubscription(userId)
    const tier = subscription?.tier || "free"
    const limits = TIER_LIMITS[tier]
    const usage = await getCurrentUsage(userId)

    let current = 0
    let limit = 0

    switch (resource) {
        case "papers":
            current = usage?.papersProcessed || 0
            limit = limits.papersPerMonth
            break
        case "gaps":
            current = usage?.gapsExtracted || 0
            limit = limits.gapsPerPaper * (usage?.papersProcessed || 0)
            break
        case "api":
            current = usage?.apiCalls || 0
            limit = limits.apiAccess ? -1 : 0
            break
        case "collections":
            // This would need a separate count query
            limit = limits.collectionsLimit
            break
    }

    const isUnlimited = limit === -1
    const allowed = isUnlimited || current < limit
    const remaining = isUnlimited ? -1 : Math.max(0, limit - current)
    const resetDate = subscription?.currentPeriodEnd?.toDate() || new Date()

    return {
        allowed,
        remaining,
        limit,
        resetDate,
        upgradeRequired: !allowed && tier !== "enterprise",
    }
}

// USAGE ANALYTICS

export interface UsageAnalytics {
    currentPeriod: UsageRecord | null
    subscription: Subscription | null
    limits: TierLimits
    quotaPercentages: {
        papers: number
        apiCalls: number
        exports: number
    }
}

export async function getUserAnalytics(userId: string): Promise<UsageAnalytics> {
    const [subscription, usage] = await Promise.all([
        getSubscription(userId),
        getCurrentUsage(userId),
    ])

    const tier = subscription?.tier || "free"
    const limits = TIER_LIMITS[tier]

    const calcPercentage = (current: number, limit: number) => {
        if (limit === -1) return 0 // unlimited
        if (limit === 0) return 100
        return Math.min(100, Math.round((current / limit) * 100))
    }

    return {
        currentPeriod: usage,
        subscription,
        limits,
        quotaPercentages: {
            papers: calcPercentage(usage?.papersProcessed || 0, limits.papersPerMonth),
            apiCalls: calcPercentage(usage?.apiCalls || 0, limits.papersPerMonth * 10),
            exports: calcPercentage(usage?.exportCount || 0, limits.papersPerMonth),
        },
    }
}

// HOOKS FOR COMPONENTS

export function getTierDisplayName(tier: SubscriptionTier): string {
    const names: Record<SubscriptionTier, string> = {
        free: "Starter",
        pro: "Pro",
        team: "Team",
        enterprise: "Enterprise",
    }
    return names[tier]
}

export function getTierPrice(tier: SubscriptionTier): string {
    const prices: Record<SubscriptionTier, string> = {
        free: "$0",
        pro: "$29",
        team: "$99",
        enterprise: "Custom",
    }
    return prices[tier]
}
