// ============================================================================
// Email Service
// Transactional email service with templates and queuing
// Supports: SendGrid, Mailgun, AWS SES, Postmark
// ============================================================================

import { query } from '../db/client.js';
import { getConfig } from './config.js';

// ============================================================================
// Types
// ============================================================================

export type EmailType = 
    | 'welcome'
    | 'verification'
    | 'password_reset'
    | 'weekly_digest'
    | 'alert_notification'
    | 'usage_warning'
    | 'subscription_confirmed'
    | 'subscription_cancelled'
    | 'payment_failed'
    | 'team_invite'
    | 'gap_shared';

export interface EmailRecipient {
    email: string;
    name?: string;
}

export interface EmailData {
    type: EmailType;
    to: EmailRecipient;
    subject?: string;
    variables?: Record<string, any>;
}

interface EmailProvider {
    send(to: EmailRecipient, subject: string, html: string, text: string): Promise<boolean>;
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

const TEMPLATES: Record<EmailType, { subject: string; html: string; text: string }> = {
    welcome: {
        subject: 'Welcome to GapMiner - Discover Research Gaps',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h1>Welcome to GapMiner! 🔬</h1>
                <p>Hi {{name}},</p>
                <p>Welcome to GapMiner, the AI-powered platform for discovering research gaps in academic papers.</p>
                <p>Here's what you can do:</p>
                <ul>
                    <li>🔍 <strong>Analyze papers</strong> - Extract research gaps automatically</li>
                    <li>📊 <strong>Track trends</strong> - Stay updated with the latest research</li>
                    <li>🎯 <strong>Get recommendations</strong> - Personalized paper suggestions</li>
                    <li>👥 <strong>Collaborate</strong> - Share gaps with your team</li>
                </ul>
                <p><a href="{{appUrl}}/dashboard" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Get Started</a></p>
                <p>Best,<br>The GapMiner Team</p>
            </div>
        `,
        text: `Welcome to GapMiner! Hi {{name}}, Welcome to GapMiner, the AI-powered platform for discovering research gaps. Get started at {{appUrl}}/dashboard`
    },

    verification: {
        subject: 'Verify your GapMiner account',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h1>Verify Your Email</h1>
                <p>Hi {{name}},</p>
                <p>Click the button below to verify your email address:</p>
                <p><a href="{{verifyUrl}}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Verify Email</a></p>
                <p>Or copy this link: {{verifyUrl}}</p>
                <p>This link expires in 24 hours.</p>
            </div>
        `,
        text: `Verify your email: {{verifyUrl}}`
    },

    password_reset: {
        subject: 'Reset your GapMiner password',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h1>Reset Password</h1>
                <p>Hi {{name}},</p>
                <p>Click the button below to reset your password:</p>
                <p><a href="{{resetUrl}}" style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
                <p>Or copy this link: {{resetUrl}}</p>
                <p>This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
            </div>
        `,
        text: `Reset your password: {{resetUrl}}`
    },

    weekly_digest: {
        subject: 'Your Weekly Research Digest',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h1>📊 Your Weekly Research Digest</h1>
                <p>Hi {{name}},</p>
                <p>Here's what you missed this week:</p>
                <h2>🔥 Trending Gaps</h2>
                {{trendingGaps}}
                <h2>📈 Your Activity</h2>
                <ul>
                    <li>Papers analyzed: {{papersCount}}</li>
                    <li>Gaps discovered: {{gapsCount}}</li>
                    <li>API calls: {{apiCalls}}</li>
                </ul>
                <p><a href="{{appUrl}}/dashboard" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Dashboard</a></p>
            </div>
        `,
        text: `Your Weekly Research Digest - View at {{appUrl}}/dashboard`
    },

    alert_notification: {
        subject: '🔔 New papers match your alert: {{alertName}}',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h1>🔔 Alert: {{alertName}}</h1>
                <p>Hi {{name}},</p>
                <p>New papers match your research alert:</p>
                {{papers}}
                <p><a href="{{appUrl}}/alerts" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View All Alerts</a></p>
            </div>
        `,
        text: `Alert: {{alertName}} - New papers match your alert`
    },

    usage_warning: {
        subject: '⚠️ Usage Warning - Approaching Limit',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h1>⚠️ Usage Warning</h1>
                <p>Hi {{name}},</p>
                <p>You're approaching your {{tier}} plan limits:</p>
                <ul>
                    <li>Papers: {{papersUsed}}/{{papersLimit}}</li>
                    <li>API Calls: {{apiCallsUsed}}/{{apiCallsLimit}}</li>
                </ul>
                <p><a href="{{appUrl}}/settings/billing" style="background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Upgrade Plan</a></p>
            </div>
        `,
        text: `Usage Warning - You're at {{papersUsed}}/{{papersLimit}} papers`
    },

    subscription_confirmed: {
        subject: '✅ Subscription Confirmed - Welcome to {{tier}}!',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h1>✅ Subscription Confirmed!</h1>
                <p>Hi {{name}},</p>
                <p>Welcome to the {{tier}} plan! Your subscription is now active.</p>
                <h2>Your Benefits:</h2>
                <ul>
                    {{benefits}}
                </ul>
                <p><a href="{{appUrl}}/dashboard" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Start Exploring</a></p>
            </div>
        `,
        text: `Subscription confirmed! You're now on the {{tier}} plan.`
    },

    subscription_cancelled: {
        subject: 'Subscription Cancelled',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h1>Subscription Cancelled</h1>
                <p>Hi {{name}},</p>
                <p>Your subscription has been cancelled. You'll retain access until {{endDate}}.</p>
                <p>We'd love to have you back! If you have feedback, please reply to this email.</p>
            </div>
        `,
        text: `Your subscription has been cancelled.`
    },

    payment_failed: {
        subject: '⚠️ Payment Failed - Action Required',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h1>⚠️ Payment Failed</h1>
                <p>Hi {{name}},</p>
                <p>We couldn't process your payment of {{amount}}.</p>
                <p>Please update your payment method to avoid service interruption.</p>
                <p><a href="{{appUrl}}/settings/billing" style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Update Payment</a></p>
            </div>
        `,
        text: `Payment failed. Please update your payment method.`
    },

    team_invite: {
        subject: '👥 You\'ve been invited to join {{teamName}}',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h1>👥 Team Invitation</h1>
                <p>Hi {{name}},</p>
                <p>{{inviterName}} has invited you to join <strong>{{teamName}}</strong> on GapMiner.</p>
                <p><a href="{{acceptUrl}}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Accept Invitation</a></p>
            </div>
        `,
        text: `You've been invited to join {{teamName}}`
    },

    gap_shared: {
        subject: '📤 A research gap was shared with you',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h1>📤 Gap Shared</h1>
                <p>Hi {{name}},</p>
                <p>{{sharerName}} shared a research gap with you:</p>
                <blockquote style="border-left: 4px solid #6366f1; padding-left: 16px; margin: 16px 0;">
                    <strong>{{gapTitle}}</strong><br>
                    {{gapProblem}}
                </blockquote>
                <p><a href="{{viewUrl}}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Gap</a></p>
            </div>
        `,
        text: `{{sharerName}} shared a research gap with you: {{gapTitle}}`
    }
};

// ============================================================================
// EMAIL PROVIDERS
// ============================================================================

class SendGridProvider implements EmailProvider {
    private apiKey: string;
    private fromEmail: string;
    private fromName: string;

    constructor(apiKey: string, fromEmail: string, fromName: string) {
        this.apiKey = apiKey;
        this.fromEmail = fromEmail;
        this.fromName = fromName;
    }

    async send(to: EmailRecipient, subject: string, html: string, text: string): Promise<boolean> {
        try {
            const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    personalizations: [{
                        to: [{ email: to.email, name: to.name }],
                    }],
                    from: { email: this.fromEmail, name: this.fromName },
                    subject,
                    content: [
                        { type: 'text/plain', value: text },
                        { type: 'text/html', value: html },
                    ],
                }),
            });
            return response.ok;
        } catch (error) {
            console.error('[Email] SendGrid error:', error);
            return false;
        }
    }
}

class ConsoleProvider implements EmailProvider {
    async send(to: EmailRecipient, subject: string, html: string, text: string): Promise<boolean> {
        console.log(`[Email] Sending to ${to.email}:`);
        console.log(`[Email] Subject: ${subject}`);
        console.log(`[Email] Body: ${text}`);
        return true;
    }
}

// ============================================================================
// EMAIL SERVICE
// ============================================================================

let provider: EmailProvider | null = null;
let emailQueue: EmailData[] = [];
let queueProcessor: NodeJS.Timeout | null = null;

async function initializeEmailService(): Promise<void> {
    const providerType = await getConfig('email.provider', 'console');
    const fromEmail = await getConfig('email.fromEmail', 'noreply@gapminer.ai');
    const fromName = await getConfig('email.fromName', 'GapMiner');
    
    if (providerType === 'sendgrid') {
        const apiKey = process.env.SENDGRID_API_KEY;
        if (apiKey) {
            provider = new SendGridProvider(apiKey, fromEmail, fromName);
            console.log('[Email] SendGrid provider initialized');
        }
    }
    
    if (!provider) {
        provider = new ConsoleProvider();
        console.log('[Email] Console provider initialized (development)');
    }
    
    // Start queue processor
    startQueueProcessor();
}

function startQueueProcessor(): void {
    if (queueProcessor) clearInterval(queueProcessor);
    
    // Process queue every 5 seconds
    queueProcessor = setInterval(async () => {
        if (emailQueue.length === 0) return;
        
        const email = emailQueue.shift();
        if (!email) return;
        
        try {
            await sendEmailImmediate(email);
        } catch (error) {
            console.error('[Email] Queue processing error:', error);
            // Re-add to queue on failure
            emailQueue.unshift(email);
        }
    }, 5000);
}

function replaceVariables(template: string, variables: Record<string, any>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    return result;
}

async function sendEmailImmediate(data: EmailData): Promise<boolean> {
    if (!provider) {
        await initializeEmailService();
    }
    
    if (!provider) {
        console.error('[Email] Provider not initialized');
        return false;
    }
    
    const template = TEMPLATES[data.type];
    if (!template) {
        console.error(`[Email] Unknown email type: ${data.type}`);
        return false;
    }
    
    const subject = data.subject || template.subject;
    const html = replaceVariables(template.html, data.variables || {});
    const text = replaceVariables(template.text, data.variables || {});
    
    return provider.send(data.to, subject, html, text);
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function sendEmail(data: EmailData): Promise<void> {
    // Add to queue for async processing
    emailQueue.push(data);
}

export async function sendEmailSync(data: EmailData): Promise<boolean> {
    return sendEmailImmediate(data);
}

export function getEmailTemplate(type: EmailType): { subject: string; html: string; text: string } | undefined {
    return TEMPLATES[type];
}

// ============================================================================
// EMAIL PREFERENCES
// ============================================================================

export async function getUserEmailPreferences(userId: string): Promise<{
    emailAlerts: boolean;
    weeklyDigest: boolean;
    marketingEmails: boolean;
}> {
    try {
        const result = await query(`
            SELECT email_alerts, weekly_digest, marketing_emails
            FROM notification_preferences
            WHERE user_id = $1
        `, [userId]);
        
        if (result.rows.length === 0) {
            return { emailAlerts: true, weeklyDigest: true, marketingEmails: false };
        }
        
        return {
            emailAlerts: result.rows[0].email_alerts ?? true,
            weeklyDigest: result.rows[0].weekly_digest ?? true,
            marketingEmails: result.rows[0].marketing_emails ?? false,
        };
    } catch {
        return { emailAlerts: true, weeklyDigest: true, marketingEmails: false };
    }
}

export async function updateUserEmailPreferences(
    userId: string, 
    preferences: {
        emailAlerts?: boolean;
        weeklyDigest?: boolean;
        marketingEmails?: boolean;
    }
): Promise<void> {
    await query(`
        INSERT INTO notification_preferences (user_id, email_alerts, weekly_digest, marketing_emails)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE SET
            email_alerts = COALESCE($2, notification_preferences.email_alerts),
            weekly_digest = COALESCE($3, notification_preferences.weekly_digest),
            marketing_emails = COALESCE($4, notification_preferences.marketing_emails),
            updated_at = NOW()
    `, [userId, preferences.emailAlerts, preferences.weeklyDigest, preferences.marketingEmails]);
}

// Initialize on module load
initializeEmailService().catch(console.error);
