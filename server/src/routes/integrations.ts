// ============================================================================
// Integrations Routes
// Slack, Notion, Zapier, and other third-party integrations
// ============================================================================

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { query, transaction } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { config } from '../config.js'

const router = Router()

// ============================================================================
// SCHEMAS
// ============================================================================

const SlackIntegrationSchema = z.object({
  workspaceId: z.string(),
  channelId: z.string(),
  channelName: z.string(),
  notifications: z.object({
    newPapers: z.boolean(),
    newGaps: z.boolean(),
    teamInvites: z.boolean(),
    weeklyDigest: z.boolean(),
  }).optional(),
})

const NotionIntegrationSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  databaseId: z.string().optional(),
  syncEnabled: z.boolean().default(true),
})

const ZapierWebhookSchema = z.object({
  trigger: z.enum(['new_paper', 'new_gap', 'gap_resolved', 'collection_updated']),
  actionUrl: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
})

// ============================================================================
// GET /integrations — List user's integrations
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId

    const [slack, notion, zapier] = await Promise.all([
      query(`SELECT * FROM integrations_slack WHERE user_id = $1`, [userId]),
      query(`SELECT * FROM integrations_notion WHERE user_id = $1`, [userId]),
      query(`SELECT * FROM integrations_zapier WHERE user_id = $1`, [userId]),
    ])

    res.json({
      slack: slack.rows[0] || null,
      notion: notion.rows[0] || null,
      zapier: zapier.rows,
    })
  } catch (error) {
    console.error('[Integrations] Get failed:', error)
    res.status(500).json({ error: 'Failed to fetch integrations' })
  }
})

// ============================================================================
// SLACK INTEGRATION
// ============================================================================

// POST /integrations/slack — Connect Slack
router.post('/slack', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId
    const data = SlackIntegrationSchema.parse(req.body)

    await query(
      `INSERT INTO integrations_slack (user_id, workspace_id, channel_id, channel_name, notifications)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         workspace_id = $2, channel_id = $3, channel_name = $4, notifications = $5`,
      [userId, data.workspaceId, data.channelId, data.channelName, JSON.stringify(data.notifications)]
    )

    res.json({ success: true, message: 'Slack connected successfully' })
  } catch (error) {
    console.error('[Integrations] Slack connect failed:', error)
    res.status(500).json({ error: 'Failed to connect Slack' })
  }
})

// DELETE /integrations/slack — Disconnect Slack
router.delete('/slack', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId
    await query(`DELETE FROM integrations_slack WHERE user_id = $1`, [userId])
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect Slack' })
  }
})

// POST /integrations/slack/test — Test Slack notification
router.post('/slack/test', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT * FROM integrations_slack WHERE user_id = $1`, [req.user!.userId])
    const slack = result.rows[0]

    if (!slack) {
      res.status(400).json({ error: 'Slack not connected' })
      return
    }

    // In production, this would send a test message to Slack
    console.log(`[Slack] Sending test message to ${slack.channel_name}`)

    res.json({ success: true, message: 'Test notification sent to Slack' })
  } catch (error) {
    res.status(500).json({ error: 'Failed to send test notification' })
  }
})

// ============================================================================
// NOTION INTEGRATION
// ============================================================================

// POST /integrations/notion — Connect Notion
router.post('/notion', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId
    const data = NotionIntegrationSchema.parse(req.body)

    await query(
      `INSERT INTO integrations_notion (user_id, workspace_id, workspace_name, database_id, sync_enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         workspace_id = $2, workspace_name = $3, database_id = $4, sync_enabled = $5`,
      [userId, data.workspaceId, data.workspaceName, data.databaseId, data.syncEnabled]
    )

    res.json({ success: true, message: 'Notion connected successfully' })
  } catch (error) {
    console.error('[Integrations] Notion connect failed:', error)
    res.status(500).json({ error: 'Failed to connect Notion' })
  }
})

// DELETE /integrations/notion — Disconnect Notion
router.delete('/notion', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId
    await query(`DELETE FROM integrations_notion WHERE user_id = $1`, [userId])
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect Notion' })
  }
})

// POST /integrations/notion/sync — Sync gaps to Notion
router.post('/notion/sync', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId

    const notion = await query(`SELECT * FROM integrations_notion WHERE user_id = $1`, [userId])
    if (!notion.rows[0]) {
      res.status(400).json({ error: 'Notion not connected' })
      return
    }

    const gaps = await query(
      `SELECT * FROM research_gaps WHERE user_id = $1 AND status = 'open' ORDER BY created_at DESC LIMIT 10`,
      [userId]
    )

    // In production, this would sync to Notion database
    console.log(`[Notion] Syncing ${gaps.rows.length} gaps to Notion`)

    res.json({ success: true, synced: gaps.rows.length })
  } catch (error) {
    res.status(500).json({ error: 'Failed to sync to Notion' })
  }
})

// ============================================================================
// ZAPIER INTEGRATION
// ============================================================================

// POST /integrations/zapier — Create Zapier webhook
router.post('/zapier', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId
    const data = ZapierWebhookSchema.parse(req.body)

    const result = await query(
      `INSERT INTO integrations_zapier (user_id, trigger, action_url, headers)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, data.trigger, data.actionUrl, data.headers ? JSON.stringify(data.headers) : null]
    )

    res.json({ success: true, webhook: result.rows[0] })
  } catch (error) {
    console.error('[Integrations] Zapier webhook failed:', error)
    res.status(500).json({ error: 'Failed to create webhook' })
  }
})

// DELETE /integrations/zapier/:id — Delete Zapier webhook
router.delete('/zapier/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId
    const webhookId = req.params.id

    await query(
      `DELETE FROM integrations_zapier WHERE id = $1 AND user_id = $2`,
      [webhookId, userId]
    )

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete webhook' })
  }
})

// ============================================================================
// EVENT DISPATCH (Called internally when events happen)
// ============================================================================

export async function dispatchIntegrationEvent(
  userId: string,
  eventType: string,
  data: any
): Promise<void> {
  try {
    // Get user's integrations
    const [slack, zapier] = await Promise.all([
      query(`SELECT * FROM integrations_slack WHERE user_id = $1`, [userId]),
      query(`SELECT * FROM integrations_zapier WHERE user_id = $1 AND trigger = $2`, [userId, eventType]),
    ])

    // Send to Slack
    if (slack.rows[0]) {
      const slackConfig = slack.rows[0]
      if (shouldSendNotification(slackConfig.notifications, eventType)) {
        console.log(`[Slack] Sending ${eventType} notification to channel`)
        // In production: send to Slack webhook
      }
    }

    // Send to Zapier
    for (const webhook of zapier.rows) {
      console.log(`[Zapier] Triggering ${eventType} webhook: ${webhook.action_url}`)
      // In production: POST to Zapier webhook URL
    }
  } catch (error) {
    console.error('[Integrations] Event dispatch failed:', error)
  }
}

function shouldSendNotification(notifications: any, eventType: string): boolean {
  const mapping: Record<string, string> = {
    'new_paper': 'newPapers',
    'new_gap': 'newGaps',
    'team_invite': 'teamInvites',
  }
  return notifications[mapping[eventType]] ?? false
}

export default router