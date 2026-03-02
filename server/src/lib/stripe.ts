// ============================================================================
// Stripe Payment Service
// Subscription billing with Stripe
// ============================================================================

import Stripe from 'stripe';
import { query } from '../db/client.js';
import { getConfig } from './config.js';
import { sendEmail } from './email.js';

// ============================================================================
// Types
// ============================================================================

export type SubscriptionTier = 'free' | 'pro' | 'team' | 'enterprise';

export interface SubscriptionPlan {
    id: string;
    name: string;
    tier: SubscriptionTier;
    priceMonthly: number;
    priceYearly: number;
    stripeMonthlyPriceId?: string;
    stripeYearlyPriceId?: string;
    features: string[];
    limits: {
        papersPerMonth: number;
        gapsPerPaper: number;
        apiCallsPerDay: number;
        teamMembers: number;
    };
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
    {
        id: 'free',
        name: 'Free',
        tier: 'free',
        priceMonthly: 0,
        priceYearly: 0,
        features: [
            '10 papers/month',
            '20 gaps/paper',
            '50 API calls/day',
            'Basic search',
            'Email support',
        ],
        limits: {
            papersPerMonth: 10,
            gapsPerPaper: 20,
            apiCallsPerDay: 50,
            teamMembers: 1,
        },
    },
    {
        id: 'pro',
        name: 'Pro',
        tier: 'pro',
        priceMonthly: 19,
        priceYearly: 190,
        stripeMonthlyPriceId: 'price_pro_monthly',
        stripeYearlyPriceId: 'price_pro_yearly',
        features: [
            '100 papers/month',
            '50 gaps/paper',
            '500 API calls/day',
            'Advanced search',
            'Priority support',
            'Export features',
            'Collections',
        ],
        limits: {
            papersPerMonth: 100,
            gapsPerPaper: 50,
            apiCallsPerDay: 500,
            teamMembers: 1,
        },
    },
    {
        id: 'team',
        name: 'Team',
        tier: 'team',
        priceMonthly: 49,
        priceYearly: 490,
        stripeMonthlyPriceId: 'price_team_monthly',
        stripeYearlyPriceId: 'price_team_yearly',
        features: [
            '500 papers/month',
            '100 gaps/paper',
            '2000 API calls/day',
            'Team collaboration',
            'Team analytics',
            'Admin dashboard',
            'API access',
            'Priority support',
        ],
        limits: {
            papersPerMonth: 500,
            gapsPerPaper: 100,
            apiCallsPerDay: 2000,
            teamMembers: 10,
        },
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        tier: 'enterprise',
        priceMonthly: 199,
        priceYearly: 1990,
        stripeMonthlyPriceId: 'price_enterprise_monthly',
        stripeYearlyPriceId: 'price_enterprise_yearly',
        features: [
            'Unlimited papers',
            'Unlimited gaps',
            'Unlimited API calls',
            'Custom integrations',
            'Dedicated support',
            'SLA guarantee',
            'SSO/SAML',
            'Audit logs',
        ],
        limits: {
            papersPerMonth: -1,
            gapsPerPaper: -1,
            apiCallsPerDay: -1,
            teamMembers: -1,
        },
    },
];

// ============================================================================
// STRIPE CLIENT
// ============================================================================

let stripe: Stripe | null = null;

async function getStripe(): Promise<Stripe | null> {
    if (stripe) return stripe;
    
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        console.warn('[Stripe] No secret key configured');
        return null;
    }
    
    stripe = new Stripe(secretKey, {
        apiVersion: '2026-02-25.clover',
    });
    
    return stripe;
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

export async function createCheckoutSession(
    userId: string,
    planId: string,
    billingCycle: 'monthly' | 'yearly' = 'monthly'
): Promise<{ url: string } | { error: string }> {
    const stripeInstance = await getStripe();
    if (!stripeInstance) {
        return { error: 'Payment system not configured' };
    }
    
    const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
    if (!plan) {
        return { error: 'Invalid plan' };
    }
    
    // Get user email
    const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
        return { error: 'User not found' };
    }
    
    const user = userResult.rows[0];
    const priceId = billingCycle === 'monthly' ? plan.stripeMonthlyPriceId : plan.stripeYearlyPriceId;
    
    if (!priceId) {
        return { error: 'Plan not available for purchase' };
    }
    
    try {
        const appUrl = await getConfig('ui.appUrl', 'http://localhost:5173');
        
        const session = await stripeInstance.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            success_url: `${appUrl}/settings/billing?success=true`,
            cancel_url: `${appUrl}/settings/billing?cancelled=true`,
            customer_email: user.email,
            metadata: {
                userId,
                planId,
                billingCycle,
            },
        });
        
        return { url: session.url! };
    } catch (error) {
        console.error('[Stripe] Create checkout error:', error);
        return { error: 'Failed to create checkout session' };
    }
}

export async function createPortalSession(userId: string): Promise<{ url: string } | { error: string }> {
    const stripeInstance = await getStripe();
    if (!stripeInstance) {
        return { error: 'Payment system not configured' };
    }
    
    // Get Stripe customer ID
    const subResult = await query(`
        SELECT external_subscription_id FROM subscriptions 
        WHERE user_id = $1 AND payment_provider = 'stripe'
    `, [userId]);
    
    if (subResult.rows.length === 0 || !subResult.rows[0].external_subscription_id) {
        return { error: 'No active subscription' };
    }
    
    try {
        // Get customer ID from subscription
        const subscription = await stripeInstance.subscriptions.retrieve(subResult.rows[0].external_subscription_id);
        
        const appUrl = await getConfig('ui.appUrl', 'http://localhost:5173');
        
        const session = await stripeInstance.billingPortal.sessions.create({
            customer: subscription.customer as string,
            return_url: `${appUrl}/settings/billing`,
        });
        
        return { url: session.url };
    } catch (error) {
        console.error('[Stripe] Create portal error:', error);
        return { error: 'Failed to create portal session' };
    }
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

export async function handleStripeWebhook(
    payload: string,
    signature: string
): Promise<{ received: boolean; error?: string }> {
    const stripeInstance = await getStripe();
    if (!stripeInstance) {
        return { received: false, error: 'Stripe not configured' };
    }
    
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        return { received: false, error: 'Webhook secret not configured' };
    }
    
    let event: Stripe.Event;
    
    try {
        event = stripeInstance.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
        return { received: false, error: 'Invalid signature' };
    }
    
    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                await handleCheckoutComplete(session);
                break;
            }
            case 'customer.subscription.updated': {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionUpdate(subscription);
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionCancelled(subscription);
                break;
            }
            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice;
                await handlePaymentFailed(invoice);
                break;
            }
            case 'invoice.payment_succeeded': {
                const invoice = event.data.object as Stripe.Invoice;
                await handlePaymentSucceeded(invoice);
                break;
            }
        }
        
        return { received: true };
    } catch (error) {
        console.error('[Stripe] Webhook handler error:', error);
        return { received: false, error: 'Handler error' };
    }
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    
    if (!userId || !planId) {
        console.error('[Stripe] Missing metadata in checkout');
        return;
    }
    
    const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
    if (!plan) return;
    
    const stripeCustomerId = session.customer as string;
    const stripeSubscriptionId = session.subscription as string;
    
    // Get user
    const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) return;
    
    const user = userResult.rows[0];
    
    // Update or insert subscription
    await query(`
        INSERT INTO subscriptions (user_id, tier, status, payment_provider, external_subscription_id, current_period_start, current_period_end)
        VALUES ($1, $2, 'active', 'stripe', $3, NOW(), NOW() + INTERVAL '30 days')
        ON CONFLICT (user_id) DO UPDATE SET
            tier = $2,
            status = 'active',
            payment_provider = 'stripe',
            external_subscription_id = $3,
            current_period_start = NOW(),
            current_period_end = NOW() + INTERVAL '30 days',
            updated_at = NOW()
    `, [userId, plan.tier, stripeSubscriptionId]);
    
    // Create usage record
    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    
    await query(`
        INSERT INTO usage_records (user_id, period_start, period_end)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, period_start) DO NOTHING
    `, [userId, periodStart, periodEnd]);
    
    // Send confirmation email
    await sendEmail({
        type: 'subscription_confirmed',
        to: { email: user.email, name: user.name },
        variables: {
            name: user.name,
            tier: plan.name,
            benefits: plan.features.map(f => `<li>${f}</li>`).join(''),
            appUrl: 'https://gapminer.ai',
        },
    });
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    
    // Find user by Stripe customer (would need to store this)
    // For now, find by subscription ID
    const result = await query(`
        SELECT user_id FROM subscriptions 
        WHERE external_subscription_id = $1
    `, [subscription.id]);
    
    if (result.rows.length === 0) return;
    
    const userId = result.rows[0].user_id;
    
    // Determine tier from price
    const priceId = subscription.items.data[0]?.price.id;
    const plan = SUBSCRIPTION_PLANS.find(p => 
        p.stripeMonthlyPriceId === priceId || p.stripeYearlyPriceId === priceId
    );
    
    const status = subscription.status === 'active' ? 'active' : 
                   subscription.status === 'past_due' ? 'past_due' : 'canceled';
    
    const periodEnd = new Date((subscription as any).current_period_end * 1000);
    
    await query(`
        UPDATE subscriptions SET
            tier = COALESCE($2, tier),
            status = $3,
            current_period_end = $4,
            cancel_at_period_end = $5,
            updated_at = NOW()
        WHERE user_id = $1
    `, [userId, plan?.tier, status, periodEnd, subscription.cancel_at_period_end]);
}

async function handleSubscriptionCancelled(subscription: Stripe.Subscription): Promise<void> {
    const result = await query(`
        SELECT user_id FROM subscriptions 
        WHERE external_subscription_id = $1
    `, [subscription.id]);
    
    if (result.rows.length === 0) return;
    
    const userId = result.rows[0].user_id;
    const periodEnd = new Date((subscription as any).current_period_end * 1000);
    
    await query(`
        UPDATE subscriptions SET
            status = 'canceled',
            cancel_at_period_end = TRUE,
            current_period_end = $2,
            updated_at = NOW()
        WHERE user_id = $1
    `, [userId, periodEnd]);
    
    // Send cancellation email
    const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        await sendEmail({
            type: 'subscription_cancelled',
            to: { email: user.email, name: user.name },
            variables: {
                name: user.name,
                endDate: periodEnd.toLocaleDateString(),
                appUrl: 'https://gapminer.ai',
            },
        });
    }
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = (invoice as any).subscription as string;
    if (!subscriptionId) return;
    
    const result = await query(`
        SELECT user_id FROM subscriptions 
        WHERE external_subscription_id = $1
    `, [subscriptionId]);
    
    if (result.rows.length === 0) return;
    
    const userId = result.rows[0].user_id;
    
    await query(`
        UPDATE subscriptions SET
            status = 'past_due',
            updated_at = NOW()
        WHERE user_id = $1
    `, [userId]);
    
    // Send payment failed email
    const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        await sendEmail({
            type: 'payment_failed',
            to: { email: user.email, name: user.name },
            variables: {
                name: user.name,
                amount: `$${(invoice.amount_due / 100).toFixed(2)}`,
                appUrl: 'https://gapminer.ai',
            },
        });
    }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = (invoice as any).subscription as string;
    if (!subscriptionId) return;
    
    const result = await query(`
        SELECT user_id FROM subscriptions 
        WHERE external_subscription_id = $1
    `, [subscriptionId]);
    
    if (result.rows.length === 0) return;
    
    const userId = result.rows[0].user_id;
    
    // Reset usage for new billing period
    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    
    await query(`
        INSERT INTO usage_records (user_id, period_start, period_end)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, period_start) DO UPDATE SET
            papers_processed = 0,
            gaps_extracted = 0,
            api_calls = 0,
            last_updated = NOW()
    `, [userId, periodStart, periodEnd]);
}

// ============================================================================
// USAGE TRACKING
// ============================================================================

export async function getUserUsage(userId: string): Promise<{
    papersUsed: number;
    papersLimit: number;
    gapsUsed: number;
    gapsLimit: number;
    apiCallsUsed: number;
    apiCallsLimit: number;
    periodEnd: Date;
}> {
    const subResult = await query(`
        SELECT tier, current_period_end FROM subscriptions 
        WHERE user_id = $1 AND status = 'active'
    `, [userId]);
    
    const tier = subResult.rows.length > 0 ? subResult.rows[0].tier : 'free';
    const periodEnd = subResult.rows.length > 0 ? subResult.rows[0].current_period_end : new Date();
    
    const plan = SUBSCRIPTION_PLANS.find(p => p.tier === tier) || SUBSCRIPTION_PLANS[0];
    
    const usageResult = await query(`
        SELECT papers_processed, gaps_extracted, api_calls
        FROM usage_records
        WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()
    `, [userId]);
    
    const usage = usageResult.rows.length > 0 ? usageResult.rows[0] : { 
        papers_processed: 0, 
        gaps_extracted: 0, 
        api_calls: 0 
    };
    
    return {
        papersUsed: usage.papers_processed,
        papersLimit: plan.limits.papersPerMonth,
        gapsUsed: usage.gaps_extracted,
        gapsLimit: plan.limits.gapsPerPaper,
        apiCallsUsed: usage.api_calls,
        apiCallsLimit: plan.limits.apiCallsPerDay,
        periodEnd: new Date(periodEnd),
    };
}

export async function incrementUsage(
    userId: string, 
    type: 'papers' | 'gaps' | 'api_calls',
    amount: number = 1
): Promise<boolean> {
    const usage = await getUserUsage(userId);
    
    // Check limits
    if (type === 'papers' && usage.papersLimit > 0 && usage.papersUsed >= usage.papersLimit) {
        return false;
    }
    if (type === 'gaps' && usage.gapsLimit > 0 && usage.gapsUsed >= usage.gapsLimit) {
        return false;
    }
    if (type === 'api_calls' && usage.apiCallsLimit > 0 && usage.apiCallsUsed >= usage.apiCallsLimit) {
        return false;
    }
    
    const columnMap = {
        papers: 'papers_processed',
        gaps: 'gaps_extracted',
        api_calls: 'api_calls',
    };
    
    await query(`
        UPDATE usage_records SET
            ${columnMap[type]} = ${columnMap[type]} + $2,
            last_updated = NOW()
        WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()
    `, [userId, amount]);
    
    return true;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function getPlan(tier: SubscriptionTier): SubscriptionPlan | undefined {
    return SUBSCRIPTION_PLANS.find(p => p.tier === tier);
}

export function getAllPlans(): SubscriptionPlan[] {
    return SUBSCRIPTION_PLANS;
}

export function getPlanFeatures(planId: string): string[] {
    const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
    return plan?.features || [];
}
