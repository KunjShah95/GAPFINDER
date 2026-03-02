// ============================================================================
// Paper Sync Service
// Auto-sync papers from arXiv and Semantic Scholar based on subscription
// ============================================================================

import { query } from '../db/client.js';
import { searchArxiv, searchSemanticScholar, ExternalPaper } from '../lib/paper-sources.js';

interface Subscription {
    id: string;
    user_id: string;
    query: string;
    sources: string[];
    sync_enabled: boolean;
    last_synced_at: Date | null;
}

export async function runPaperSync(): Promise<void> {
    console.log('[PaperSync] Starting paper sync...');

    try {
        // Get all enabled subscriptions
        const subsResult = await query(
            `SELECT * FROM paper_subscriptions WHERE sync_enabled = TRUE`
        );

        const subscriptions: Subscription[] = subsResult.rows;
        console.log(`[PaperSync] Checking ${subscriptions.length} subscriptions`);

        for (const sub of subscriptions) {
            await syncSubscription(sub);
        }

        console.log('[PaperSync] Paper sync complete');
    } catch (error) {
        console.error('[PaperSync] Error running paper sync:', error);
    }
}

async function syncSubscription(subscription: Subscription): Promise<void> {
    try {
        const papers: ExternalPaper[] = [];

        // Check last synced, maybe skip if too recent
        const lastSynced = subscription.last_synced_at ? new Date(subscription.last_synced_at) : new Date(0);
        const hoursSinceSync = (Date.now() - lastSynced.getTime()) / (1000 * 60 * 60);

        if (hoursSinceSync < 24) {
            console.log(`[PaperSync] Skipping subscription ${subscription.id} (synced ${hoursSinceSync.toFixed(1)}h ago)`);
            return;
        }

        if (subscription.sources.includes('arxiv')) {
            const arxivPapers = await searchArxiv(subscription.query, 10);
            papers.push(...arxivPapers);
        }

        if (subscription.sources.includes('semantic_scholar')) {
            const ssPapers = await searchSemanticScholar(subscription.query, 10);
            papers.push(...ssPapers);
        }

        let newCount = 0;
        // Add new papers to user's collection
        for (const paper of papers) {
            if (await addSyncedPaper(subscription, paper)) {
                newCount++;
            }
        }

        // Update last_synced_at
        await query(
            `UPDATE paper_subscriptions SET last_synced_at = NOW() WHERE id = $1`,
            [subscription.id]
        );

        console.log(`[PaperSync] Synced ${newCount} new papers for subscription ${subscription.id}`);
    } catch (error) {
        console.error(`[PaperSync] Error syncing subscription ${subscription.id}:`, error);
    }
}

async function addSyncedPaper(subscription: Subscription, paper: ExternalPaper): Promise<boolean> {
    try {
        // Check if already synced in synced_papers or existing in papers table
        const existing = await query(
            `SELECT id FROM synced_papers 
             WHERE external_id = $1 AND user_id = $2`,
            [paper.externalId, subscription.user_id]
        );

        if (existing.rows.length > 0) {
            return false; // Already synced
        }

        // Add to main papers table
        // We use a separate query because we want to return the ID
        const paperResult = await query(
            `INSERT INTO papers (user_id, title, abstract, url, authors, venue, year, source, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
             ON CONFLICT (user_id, url) DO NOTHING
             RETURNING id`,
            [
                subscription.user_id,
                paper.title,
                paper.abstract,
                paper.url,
                paper.authors,
                paper.venue,
                paper.year,
                paper.source,
            ]
        );

        if (paperResult.rows.length === 0) {
            return false; // Already existed in main table (conflict)
        }

        const paperId = paperResult.rows[0].id;

        // Record tracking
        await query(
            `INSERT INTO synced_papers (external_id, source, user_id, subscription_id, paper_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [paper.externalId, paper.source, subscription.user_id, subscription.id, paperId]
        );

        return true;
    } catch (error) {
        console.error(`[PaperSync] Failed to add paper ${paper.title}:`, error);
        return false;
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runPaperSync()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
