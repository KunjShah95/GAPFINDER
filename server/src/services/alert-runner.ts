// ============================================================================
// Alert Runner Service
// Background service that checks for new papers matching user alerts
// ============================================================================

import { query } from '../db/client.js';
import { searchArxiv, searchSemanticScholar, ExternalPaper } from '../lib/paper-sources.js';

interface Alert {
    id: string;
    user_id: string;
    query: string;
    frequency: string;
    sources: string[];
    match_type: string;
    is_active: boolean;
    last_triggered_at: Date | null;
}

// Run the alert checker
export async function runAlertChecker(): Promise<void> {
    console.log('[AlertRunner] Starting alert check...');

    try {
        // Get all active alerts
        const alertsResult = await query(
            `SELECT * FROM research_alerts WHERE is_active = TRUE`
        );

        const alerts: Alert[] = alertsResult.rows;
        console.log(`[AlertRunner] Checking ${alerts.length} alerts`);

        for (const alert of alerts) {
            await checkAlert(alert);
        }

        console.log('[AlertRunner] Alert check complete');
    } catch (error) {
        console.error('[AlertRunner] Error running alert checker:', error);
    }
}

async function checkAlert(alert: Alert): Promise<void> {
    try {
        // Check if we should trigger based on frequency
        const shouldTrigger = shouldTriggerAlert(alert);
        if (!shouldTrigger) {
            return;
        }

        // Search for new papers matching the alert query
        const papers = await searchPapers(alert.query, alert.sources);

        // Filter papers that are newer than last_triggered_at
        const lastTriggered = alert.last_triggered_at ? new Date(alert.last_triggered_at) : new Date(0);
        const newPapers = papers.filter(p => p.published > lastTriggered);

        if (newPapers.length > 0) {
            console.log(`[AlertRunner] Found ${newPapers.length} new papers for alert ${alert.id}`);

            // Create notifications for each paper
            for (const paper of newPapers) {
                await createNotification(alert, paper);
            }

            // Update last_triggered_at
            await query(
                `UPDATE research_alerts SET last_triggered_at = NOW() WHERE id = $1`,
                [alert.id]
            );
        }
    } catch (error) {
        console.error(`[AlertRunner] Error checking alert ${alert.id}:`, error);
    }
}

function shouldTriggerAlert(alert: Alert): boolean {
    if (!alert.last_triggered_at) {
        return true; // First run
    }

    const now = new Date();
    const lastTriggered = new Date(alert.last_triggered_at);
    const hoursSinceLastTrigger = (now.getTime() - lastTriggered.getTime()) / (1000 * 60 * 60);

    switch (alert.frequency) {
        case 'daily':
            return hoursSinceLastTrigger >= 24;
        case 'weekly':
            return hoursSinceLastTrigger >= 168; // 7 days
        case 'monthly':
            return hoursSinceLastTrigger >= 720; // 30 days
        default:
            return false;
    }
}

async function searchPapers(
    searchQuery: string,
    sources: string[]
): Promise<ExternalPaper[]> {
    const papers: ExternalPaper[] = [];

    // Search arXiv
    if (sources.includes('arxiv')) {
        const arxivPapers = await searchArxiv(searchQuery, 10);
        papers.push(...arxivPapers);
    }

    // Search Semantic Scholar
    if (sources.includes('semantic_scholar')) {
        const ssPapers = await searchSemanticScholar(searchQuery, 10);
        papers.push(...ssPapers);
    }

    return papers;
}

async function createNotification(alert: Alert, paper: ExternalPaper): Promise<void> {
    // Check if we already notified about this paper for this alert (to avoid duplicates if date overlap)
    // Actually, simple way is just check notification table for same alert_id and paper title/url in metadata
    // But we don't store paper metadata well in notification table directly except title/body.
    // Let's assume the date filter is sufficient for now, or check exists.

    // First, ensure paper is in our DB? No, alert notification might just link to external URL.
    // But our schema links to `paper_id`. So we MUST insert the paper first if it doesn't exist.

    // Try to insert paper or find existing
    const paperResult = await query(
        `INSERT INTO papers (user_id, title, abstract, url, authors, venue, year, source, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (user_id, url) DO UPDATE SET title = EXCLUDED.title 
         RETURNING id`,
        [
            alert.user_id,
            paper.title,
            paper.abstract,
            paper.url,
            paper.authors,
            paper.venue,
            paper.year,
            paper.source,
        ]
    );

    const paperId = paperResult.rows[0].id;

    // Create notification
    await query(
        `INSERT INTO alert_notifications (alert_id, paper_id, title, body, notification_type)
         VALUES ($1, $2, $3, $4, 'in_app')`,
        [alert.id, paperId, `New paper: ${paper.title}`, `A new paper matches your alert: "${alert.query}"`]
    );
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAlertChecker()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
