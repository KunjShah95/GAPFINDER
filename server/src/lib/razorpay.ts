// ============================================================================
// Razorpay Payment Service
// Subscription billing with Razorpay for India/Asia markets
// ============================================================================

import Razorpay from 'razorpay';
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
    razorpayMonthlyPlanId?: string;
    razorpayYearlyPlanId?: string;
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
        razorpayMonthlyPlanId: 'plan_pro_monthly',
        razorpayYearlyPlanId: 'plan_pro_yearly',
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
        razorpayMonthlyPlanId: 'plan_team_monthly',
        razorpayYearlyPlanId: 'plan_team_yearly',
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
        razorpayMonthlyPlanId: 'plan_enterprise_monthly',
        razorpayYearlyPlanId: 'plan_enterprise_yearly',
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
// RAZORPAY CLIENT
// ============================================================================

let razorpay: Razorpay | null = null;

async function getRazorpay(): Promise<Razorpay | null> {
    if (razorpay) return razorpay;
    
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    
    if (!keyId || !keySecret) {
        console.warn('[Razorpay] No API keys configured');
        return null;
    }
    
    razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
    });
    
    return razorpay;
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

export async function createRazorpayCheckout(
    userId: string,
    planId: string,
    billingCycle: 'monthly' | 'yearly' = 'monthly'
): Promise<{ url: string } | { error: string }> {
    const razorpayInstance = await getRazorpay();
    if (!razorpayInstance) {
        return { error: 'Razorpay not configured' };
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
    const amount = billingCycle === 'monthly' ? plan.priceMonthly : plan.priceYearly;
    
    if (amount === 0) {
        return { error: 'Free plan cannot be purchased' };
    }
    
    try {
        const appUrl = await getConfig('ui.appUrl', 'http://localhost:5173');
        
        // Create a subscription
        const planIdRazorpay = billingCycle === 'monthly' 
            ? plan.razorpayMonthlyPlanId 
            : plan.razorpayYearlyPlanId;
        
        if (!planIdRazorpay) {
            return { error: 'Plan not available for purchase' };
        }
        
        const subscription = await razorpayInstance.subscriptions.create({
            plan_id: planIdRazorpay,
            customer_notify: 1,
            total_count: billingCycle === 'monthly' ? 12 : 12,
            notes: {
                userId,
                planId,
                billingCycle,
            },
        }) as unknown as { id: string };
        
        // Generate checkout URL - in production you'd use the Razorpay Checkout
        // For now, return a hosted page link
        const checkoutUrl = `https://rzp.io/i/${subscription.id}`;
        
        return { url: checkoutUrl };
    } catch (error) {
        console.error('[Razorpay] Create checkout error:', error);
        return { error: 'Failed to create checkout' };
    }
}

export async function createRazorpayPortalSession(userId: string): Promise<{ url: string } | { error: string }> {
    const razorpayInstance = await getRazorpay();
    if (!razorpayInstance) {
        return { error: 'Razorpay not configured' };
    }
    
    // Get customer ID from subscription
    const subResult = await query(`
        SELECT external_subscription_id FROM subscriptions 
        WHERE user_id = $1 AND payment_provider = 'razorpay'
    `, [userId]);
    
    if (subResult.rows.length === 0 || !subResult.rows[0].external_subscription_id) {
        return { error: 'No active subscription' };
    }
    
    try {
        const subscription = await razorpayInstance.subscriptions.fetch(subResult.rows[0].external_subscription_id);
        
        // Get customer details
        if (!subscription.customer_id) {
            return { error: 'No customer linked to subscription' };
        }
        
        // For Razorpay, we return the customer portal URL
        const appUrl = await getConfig('ui.appUrl', 'http://localhost:5173');
        
        return { 
            url: `https://dashboard.razorpay.com/app/subscriptions?customer_id=${subscription.customer_id}` 
        };
    } catch (error) {
        console.error('[Razorpay] Create portal error:', error);
        return { error: 'Failed to create portal session' };
    }
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

export async function handleRazorpayWebhook(
    payload: string,
    signature: string
): Promise<{ received: boolean; error?: string }> {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
        return { received: false, error: 'Webhook secret not configured' };
    }
    
    const crypto = await import('crypto');
    
    // Verify signature
    const expectedSignature = crypto.createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');
    
    if (signature !== expectedSignature) {
        return { received: false, error: 'Invalid signature' };
    }
    
    let event: any;
    try {
        event = JSON.parse(payload);
    } catch {
        return { received: false, error: 'Invalid JSON' };
    }
    
    try {
        switch (event.event) {
            case 'subscription.activated': {
                await handleSubscriptionActivated(event.payload);
                break;
            }
            case 'subscription.cancelled': {
                await handleSubscriptionCancelled(event.payload);
                break;
            }
            case 'subscription.paused': {
                await handleSubscriptionPaused(event.payload);
                break;
            }
            case 'subscription.resumed': {
                await handleSubscriptionResumed(event.payload);
                break;
            }
            case 'subscription.charged': {
                await handlePaymentCharged(event.payload);
                break;
            }
            case 'payment.failed': {
                await handlePaymentFailed(event.payload);
                break;
            }
        }
        
        return { received: true };
    } catch (error) {
        console.error('[Razorpay] Webhook handler error:', error);
        return { received: false, error: 'Handler error' };
    }
}

async function handleSubscriptionActivated(payload: any): Promise<void> {
    const subscription = payload.subscription;
    const userId = subscription.notes?.userId;
    
    if (!userId) {
        console.error('[Razorpay] No userId in subscription notes');
        return;
    }
    
    const planId = subscription.notes?.planId;
    const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
    if (!plan) return;
    
    // Calculate period end
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    
    await query(`
        INSERT INTO subscriptions (user_id, tier, status, payment_provider, external_subscription_id, current_period_start, current_period_end)
        VALUES ($1, $2, 'active', 'razorpay', $3, NOW(), $4)
        ON CONFLICT (user_id) DO UPDATE SET
            tier = $2,
            status = 'active',
            payment_provider = 'razorpay',
            external_subscription_id = $3,
            current_period_start = NOW(),
            current_period_end = $4,
            updated_at = NOW()
    `, [userId, plan.tier, subscription.id, periodEnd]);
    
    // Create usage record
    await query(`
        INSERT INTO usage_records (user_id, period_start, period_end)
        VALUES ($1, NOW(), $2)
        ON CONFLICT (user_id, period_start) DO NOTHING
    `, [userId, periodEnd]);
    
    // Send confirmation email
    const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
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
}

async function handleSubscriptionCancelled(payload: any): Promise<void> {
    const subscription = payload.subscription;
    
    const result = await query(`
        SELECT user_id FROM subscriptions 
        WHERE external_subscription_id = $1
    `, [subscription.id]);
    
    if (result.rows.length === 0) return;
    
    const userId = result.rows[0].user_id;
    
    await query(`
        UPDATE subscriptions SET
            status = 'canceled',
            cancel_at_period_end = TRUE,
            updated_at = NOW()
        WHERE user_id = $1
    `, [userId]);
    
    // Send cancellation email
    const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        await sendEmail({
            type: 'subscription_cancelled',
            to: { email: user.email, name: user.name },
            variables: {
                name: user.name,
                endDate: new Date().toLocaleDateString(),
                appUrl: 'https://gapminer.ai',
            },
        });
    }
}

async function handleSubscriptionPaused(payload: any): Promise<void> {
    const subscription = payload.subscription;
    
    await query(`
        UPDATE subscriptions SET
            status = 'paused',
            updated_at = NOW()
        WHERE external_subscription_id = $1
    `, [subscription.id]);
}

async function handleSubscriptionResumed(payload: any): Promise<void> {
    const subscription = payload.subscription;
    
    await query(`
        UPDATE subscriptions SET
            status = 'active',
            updated_at = NOW()
        WHERE external_subscription_id = $1
    `, [subscription.id]);
}

async function handlePaymentCharged(payload: any): Promise<void> {
    const subscription = payload.subscription;
    
    // Reset usage for new billing period
    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    
    const result = await query(`
        SELECT user_id FROM subscriptions 
        WHERE external_subscription_id = $1
    `, [subscription.id]);
    
    if (result.rows.length > 0) {
        const userId = result.rows[0].user_id;
        
        await query(`
            INSERT INTO usage_records (user_id, period_start, period_end)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, period_start) DO UPDATE SET
                papers_processed = 0,
                gaps_extracted = 0,
                api_calls = 0,
                last_updated = NOW()
        `, [userId, periodStart, periodEnd]);
        
        // Update period end
        await query(`
            UPDATE subscriptions SET
                current_period_end = $1,
                updated_at = NOW()
            WHERE user_id = $2
        `, [periodEnd, userId]);
    }
}

async function handlePaymentFailed(payload: any): Promise<void> {
    const subscription = payload.subscription;
    
    const result = await query(`
        SELECT user_id FROM subscriptions 
        WHERE external_subscription_id = $1
    `, [subscription.id]);
    
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
        const payment = payload.payment;
        const amount = payment ? `₹${payment.amount / 100}` : 'unknown';
        
        await sendEmail({
            type: 'payment_failed',
            to: { email: user.email, name: user.name },
            variables: {
                name: user.name,
                amount,
                appUrl: 'https://gapminer.ai',
            },
        });
    }
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
