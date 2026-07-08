// ============================================================================
// Notifications Routes
// User notification preferences and notification management
// ============================================================================

import { Router, Request, Response } from 'express'
import { query, transaction } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// ============================================================================
// GET /api/notifications — List user's notifications
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId

    const result = await query(
      `SELECT id, user_id, type, title, message, link, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    )

    const unreadResult = await query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    )

    const notifications = result.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      message: row.message,
      link: row.link,
      isRead: row.is_read,
      createdAt: row.created_at,
    }))

    res.json({ notifications, unreadCount: parseInt(unreadResult.rows[0]?.count || '0') })
  } catch (error) {
    console.error('[Notifications] Get failed:', error)
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
})

// ============================================================================
// GET /api/notifications/preferences — Get notification preferences
// ============================================================================

router.get('/preferences', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId

    const result = await query(
      `SELECT * FROM notification_preferences WHERE user_id = $1`,
      [userId]
    )

    if (result.rows.length === 0) {
      // Create default preferences
      const insertResult = await query(
        `INSERT INTO notification_preferences (user_id, email_enabled, push_enabled, types, digest_frequency)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          userId,
          true,
          true,
          JSON.stringify({
            new_paper: true,
            gap_found: true,
            team_invite: true,
            subscription_alert: true,
            system_update: true,
            weekly_digest: true,
          }),
          'weekly',
        ]
      )
      const prefs = insertResult.rows[0]
      res.json({
        emailEnabled: prefs.email_enabled,
        pushEnabled: prefs.push_enabled,
        types: typeof prefs.types === 'string' ? JSON.parse(prefs.types) : prefs.types,
        digestFrequency: prefs.digest_frequency,
      })
    } else {
      const prefs = result.rows[0]
      res.json({
        emailEnabled: prefs.email_enabled,
        pushEnabled: prefs.push_enabled,
        types: typeof prefs.types === 'string' ? JSON.parse(prefs.types) : prefs.types,
        digestFrequency: prefs.digest_frequency,
      })
    }
  } catch (error) {
    console.error('[Notifications] Get preferences failed:', error)
    res.status(500).json({ error: 'Failed to fetch preferences' })
  }
})

// ============================================================================
// PUT /api/notifications/preferences — Update notification preferences
// ============================================================================

router.put('/preferences', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId
    const { emailEnabled, pushEnabled, types, digestFrequency } = req.body

    // Check if preferences exist
    const existing = await query(
      `SELECT id FROM notification_preferences WHERE user_id = $1`,
      [userId]
    )

    if (existing.rows.length === 0) {
      // Insert new preferences
      await query(
        `INSERT INTO notification_preferences (user_id, email_enabled, push_enabled, types, digest_frequency)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, emailEnabled ?? true, pushEnabled ?? true, JSON.stringify(types ?? {}), digestFrequency ?? 'weekly']
      )
    } else {
      // Update existing preferences
      const updates: string[] = []
      const values: any[] = []
      let paramIndex = 1

      if (emailEnabled !== undefined) {
        updates.push(`email_enabled = $${paramIndex++}`)
        values.push(emailEnabled)
      }
      if (pushEnabled !== undefined) {
        updates.push(`push_enabled = $${paramIndex++}`)
        values.push(pushEnabled)
      }
      if (types !== undefined) {
        updates.push(`types = $${paramIndex++}`)
        values.push(JSON.stringify(types))
      }
      if (digestFrequency !== undefined) {
        updates.push(`digest_frequency = $${paramIndex++}`)
        values.push(digestFrequency)
      }

      if (updates.length > 0) {
        values.push(userId)
        await query(
          `UPDATE notification_preferences SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`,
          values
        )
      }
    }

    res.json({ success: true })
  } catch (error) {
    console.error('[Notifications] Update preferences failed:', error)
    res.status(500).json({ error: 'Failed to update preferences' })
  }
})

// ============================================================================
// POST /api/notifications/:id/read — Mark notification as read
// ============================================================================

router.post('/:id/read', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId
    const notifId = req.params.id

    await query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
      [notifId, userId]
    )

    res.json({ success: true })
  } catch (error) {
    console.error('[Notifications] Mark as read failed:', error)
    res.status(500).json({ error: 'Failed to mark as read' })
  }
})

// ============================================================================
// POST /api/notifications/read-all — Mark all notifications as read
// ============================================================================

router.post('/read-all', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId

    await query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1`,
      [userId]
    )

    res.json({ success: true })
  } catch (error) {
    console.error('[Notifications] Mark all as read failed:', error)
    res.status(500).json({ error: 'Failed to mark all as read' })
  }
})

export default router