// ============================================================================
// Billing & Subscription Routes
// Supports both Stripe and Razorpay payment providers
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getUserUsage } from '../lib/stripe.js';
import { getAllPlans as getStripePlans, getPlan as getStripePlan } from '../lib/stripe.js';
import { getAllPlans as getRazorpayPlans, getPlan as getRazorpayPlan, createRazorpayCheckout, createRazorpayPortalSession, handleRazorpayWebhook } from '../lib/razorpay.js';
import { isFeatureEnabled, getConfig } from '../lib/config.js';

const router = Router();

// ============================================================================
// GET /billing/plans — Get available subscription plans
// ============================================================================

router.get('/plans', async (_req: Request, res: Response): Promise<void> => {
    try {
        const paymentProvider = await getConfig('payment.provider', 'stripe');
        
        const plans = paymentProvider === 'razorpay' 
            ? getRazorpayPlans().map(plan => ({
                id: plan.id,
                name: plan.name,
                tier: plan.tier,
                priceMonthly: plan.priceMonthly,
                priceYearly: plan.priceYearly,
                features: plan.features,
                limits: plan.limits,
                currency: 'INR',
                currencySymbol: '₹',
            }))
            : getStripePlans().map(plan => ({
                id: plan.id,
                name: plan.name,
                tier: plan.tier,
                priceMonthly: plan.priceMonthly,
                priceYearly: plan.priceYearly,
                features: plan.features,
                limits: plan.limits,
                currency: 'USD',
                currencySymbol: '$',
            }));
        
        res.json({ 
            plans,
            provider: paymentProvider,
        });
    } catch (error) {
        console.error('[Billing] Get plans error:', error);
        res.status(500).json({ error: 'Failed to get plans' });
    }
});

// ============================================================================
// GET /billing/subscription — Get user's current subscription
// ============================================================================

router.get('/subscription', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { query } = await import('../db/client.js');
        
        const result = await query(`
            SELECT tier, status, current_period_start, current_period_end, 
                   cancel_at_period_end, payment_provider, created_at
            FROM subscriptions 
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 1
        `, [req.user!.userId]);
        
        const usage = await getUserUsage(req.user!.userId);
        const paymentProvider = await getConfig('payment.provider', 'stripe');
        
        const getPlan = paymentProvider === 'razorpay' ? getRazorpayPlan : getStripePlan;
        
        if (result.rows.length === 0) {
            res.json({
                tier: 'free',
                status: 'active',
                plan: getPlan('free'),
                usage,
                provider: paymentProvider,
            });
            return;
        }
        
        const sub = result.rows[0];
        
        res.json({
            tier: sub.tier,
            status: sub.status,
            currentPeriodStart: sub.current_period_start,
            currentPeriodEnd: sub.current_period_end,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            paymentProvider: sub.payment_provider,
            plan: getPlan(sub.tier),
            usage,
            provider: paymentProvider,
        });
    } catch (error) {
        console.error('[Billing] Get subscription error:', error);
        res.status(500).json({ error: 'Failed to get subscription' });
    }
});

// ============================================================================
// POST /billing/checkout — Create checkout session
// ============================================================================

const CheckoutSchema = z.object({
    planId: z.enum(['pro', 'team', 'enterprise']),
    billingCycle: z.enum(['monthly', 'yearly']).optional().default('monthly'),
    provider: z.enum(['stripe', 'razorpay']).optional(),
});

router.post('/checkout', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        if (!isFeatureEnabled('enablePayments')) {
            res.status(404).json({ error: 'Payments not available' });
            return;
        }
        
        const parsed = CheckoutSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Invalid plan', details: parsed.error.issues });
            return;
        }
        
        const { planId, billingCycle, provider } = parsed.data;
        const paymentProvider = provider || await getConfig('payment.provider', 'stripe');
        
        let result;
        
        if (paymentProvider === 'razorpay') {
            result = await createRazorpayCheckout(req.user!.userId, planId, billingCycle);
        } else {
            const { createCheckoutSession } = await import('../lib/stripe.js');
            result = await createCheckoutSession(req.user!.userId, planId, billingCycle);
        }
        
        if ('error' in result) {
            res.status(400).json({ error: result.error });
            return;
        }
        
        res.json({
            ...result,
            provider: paymentProvider,
        });
    } catch (error) {
        console.error('[Billing] Checkout error:', error);
        res.status(500).json({ error: 'Failed to create checkout' });
    }
});

// ============================================================================
// POST /billing/portal — Create customer portal session
// ============================================================================

router.post('/portal', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { query } = await import('../db/client.js');
        
        // Get user's current subscription provider
        const subResult = await query(`
            SELECT payment_provider FROM subscriptions 
            WHERE user_id = $1 AND status = 'active'
        `, [req.user!.userId]);
        
        const paymentProvider = subResult.rows.length > 0 
            ? subResult.rows[0].payment_provider 
            : await getConfig('payment.provider', 'stripe');
        
        let result;
        
        if (paymentProvider === 'razorpay') {
            result = await createRazorpayPortalSession(req.user!.userId);
        } else {
            const { createPortalSession } = await import('../lib/stripe.js');
            result = await createPortalSession(req.user!.userId);
        }
        
        if ('error' in result) {
            res.status(400).json({ error: result.error });
            return;
        }
        
        res.json({
            ...result,
            provider: paymentProvider,
        });
    } catch (error) {
        console.error('[Billing] Portal error:', error);
        res.status(500).json({ error: 'Failed to create portal session' });
    }
});

// ============================================================================
// GET /billing/usage — Get user's current usage
// ============================================================================

router.get('/usage', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const usage = await getUserUsage(req.user!.userId);
        res.json(usage);
    } catch (error) {
        console.error('[Billing] Usage error:', error);
        res.status(500).json({ error: 'Failed to get usage' });
    }
});

// ============================================================================
// POST /billing/webhook/stripe — Stripe webhook handler
// ============================================================================

router.post('/webhook/stripe', async (req: Request, res: Response): Promise<void> => {
    try {
        const signature = req.headers['stripe-signature'] as string;
        
        if (!signature) {
            res.status(400).json({ error: 'Missing signature' });
            return;
        }
        
        const payload = JSON.stringify(req.body);
        const { handleStripeWebhook } = await import('../lib/stripe.js');
        
        const result = await handleStripeWebhook(payload, signature);
        
        if (!result.received) {
            res.status(400).json({ error: result.error });
            return;
        }
        
        res.json({ received: true, provider: 'stripe' });
    } catch (error) {
        console.error('[Billing] Stripe webhook error:', error);
        res.status(500).json({ error: 'Webhook handler failed' });
    }
});

// ============================================================================
// POST /billing/webhook/razorpay — Razorpay webhook handler
// ============================================================================

router.post('/webhook/razorpay', async (req: Request, res: Response): Promise<void> => {
    try {
        const signature = req.headers['x-razorpay-signature'] as string;
        
        if (!signature) {
            res.status(400).json({ error: 'Missing signature' });
            return;
        }
        
        const payload = JSON.stringify(req.body);
        
        const result = await handleRazorpayWebhook(payload, signature);
        
        if (!result.received) {
            res.status(400).json({ error: result.error });
            return;
        }
        
        res.json({ received: true, provider: 'razorpay' });
    } catch (error) {
        console.error('[Billing] Razorpay webhook error:', error);
        res.status(500).json({ error: 'Webhook handler failed' });
    }
});

// ============================================================================
// POST /billing/webhook — Auto-detect provider webhook
// ============================================================================

router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
    try {
        // Try to detect provider from headers
        const stripeSignature = req.headers['stripe-signature'];
        const razorpaySignature = req.headers['x-razorpay-signature'];
        
        if (stripeSignature) {
            const signature = req.headers['stripe-signature'] as string;
            const payload = JSON.stringify(req.body);
            const { handleStripeWebhook } = await import('../lib/stripe.js');
            const result = await handleStripeWebhook(payload, signature);
            
            if (!result.received) {
                res.status(400).json({ error: result.error });
                return;
            }
            
            res.json({ received: true, provider: 'stripe' });
        } else if (razorpaySignature) {
            const signature = req.headers['x-razorpay-signature'] as string;
            const payload = JSON.stringify(req.body);
            const result = await handleRazorpayWebhook(payload, signature);
            
            if (!result.received) {
                res.status(400).json({ error: result.error });
                return;
            }
            
            res.json({ received: true, provider: 'razorpay' });
        } else {
            res.status(400).json({ error: 'Unknown payment provider' });
        }
    } catch (error) {
        console.error('[Billing] Webhook error:', error);
        res.status(500).json({ error: 'Webhook handler failed' });
    }
});

// ============================================================================
// GET /billing/providers — Get available payment providers
// ============================================================================

router.get('/providers', async (_req: Request, res: Response): Promise<void> => {
    try {
        const providers = [];
        
        // Check if Stripe is configured
        if (process.env.STRIPE_SECRET_KEY) {
            providers.push({
                id: 'stripe',
                name: 'Stripe',
                supportedCountries: ['US', 'EU', 'UK', 'CA', 'AU', 'JP'],
                currency: 'USD',
                features: ['cards', 'apple_pay', 'google_pay'],
            });
        }
        
        // Check if Razorpay is configured
        if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
            providers.push({
                id: 'razorpay',
                name: 'Razorpay',
                supportedCountries: ['IN', 'SG', 'MY', 'AE'],
                currency: 'INR',
                features: ['cards', 'upi', 'wallets', 'netbanking'],
            });
        }
        
        res.json({ 
            providers,
            defaultProvider: await getConfig('payment.provider', providers.length > 0 ? providers[0].id : 'stripe'),
        });
    } catch (error) {
        console.error('[Billing] Get providers error:', error);
        res.status(500).json({ error: 'Failed to get providers' });
    }
});

export default router;
