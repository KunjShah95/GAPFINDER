// ============================================================================
// Latest Papers Cron Job
// Runs daily at 06:00 UTC — fetches the newest papers from famous publishers
// and stores them in the `latest_papers` table.
//
// Famous publishers covered:
//   • arXiv        (CS / Physics / Math / Bio preprints)
//   • PubMed       (Life sciences, NCBI E-utilities)
//   • CrossRef     (Multi-publisher, peer-reviewed journals)
//   • bioRxiv      (Biology preprints)
//   • Nature       (Nature journal RSS)
//   • PLOS ONE     (Open-access mega-journal)
//   • IEEE         (Engineering / CS, IEEE Transactions on Neural Networks RSS)
//   • Springer     (Springer Nature open-access articles)
// ============================================================================

import cron from 'node-cron';
import { query } from '../db/client.js';
import {
    searchArxiv,
    fetchLatestPubMed,
    fetchLatestCrossRef,
    fetchLatestBioRxiv,
    fetchLatestNature,
    fetchLatestPLOS,
    fetchLatestIEEE,
    fetchLatestSpringer,
    LatestPaperResult,
} from '../lib/paper-sources.js';

// Default search topics used for keyword-driven sources (arXiv / PubMed / CrossRef)
const DEFAULT_TOPICS = [
    'machine learning',
    'artificial intelligence',
    'deep learning',
    'natural language processing',
    'computer vision',
    'bioinformatics',
    'climate change',
    'drug discovery',
];

// Papers to fetch per source per run
const PAPERS_PER_SOURCE = 20;

// Ensure the tables used by this service exist, even on databases that were
// created before the latest migrations were added.
export async function ensureLatestPapersTables(): Promise<void> {
    await query(`
        CREATE TABLE IF NOT EXISTS latest_papers (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            external_id TEXT NOT NULL,
            source VARCHAR(50) NOT NULL,
            publisher VARCHAR(50) NOT NULL,
            title TEXT NOT NULL,
            abstract TEXT,
            url TEXT NOT NULL,
            authors TEXT[] DEFAULT '{}',
            venue VARCHAR(255),
            year INT,
            published_at TIMESTAMPTZ,
            fetched_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (external_id, publisher)
        )
    `);

    await query(`
        CREATE INDEX IF NOT EXISTS idx_latest_papers_publisher ON latest_papers (publisher)
    `);

    await query(`
        CREATE INDEX IF NOT EXISTS idx_latest_papers_published ON latest_papers (published_at DESC)
    `);

    await query(`
        CREATE INDEX IF NOT EXISTS idx_latest_papers_fetched ON latest_papers (fetched_at DESC)
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS cron_run_log (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            job_name VARCHAR(100) NOT NULL,
            started_at TIMESTAMPTZ DEFAULT NOW(),
            finished_at TIMESTAMPTZ,
            papers_fetched INT DEFAULT 0,
            status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
            error_msg TEXT
        )
    `);

    await query(`
        CREATE INDEX IF NOT EXISTS idx_cron_run_log_job ON cron_run_log (job_name, started_at DESC)
    `);
}

// ============================================================================
// Core fetch logic
// ============================================================================

async function fetchAllLatestPapers(): Promise<LatestPaperResult[]> {
    const all: LatestPaperResult[] = [];

    // arXiv — pick a selection of topics
    for (const topic of DEFAULT_TOPICS.slice(0, 4)) {
        const papers = await searchArxiv(topic, Math.ceil(PAPERS_PER_SOURCE / 4));
        all.push(
            ...papers.map(p => ({
                ...p,
                publisher: 'arxiv' as const,
            })),
        );
    }

    // PubMed
    for (const topic of DEFAULT_TOPICS.slice(0, 3)) {
        const papers = await fetchLatestPubMed(topic, Math.ceil(PAPERS_PER_SOURCE / 3));
        all.push(...papers);
    }

    // CrossRef
    for (const topic of DEFAULT_TOPICS.slice(0, 3)) {
        const papers = await fetchLatestCrossRef(topic, Math.ceil(PAPERS_PER_SOURCE / 3));
        all.push(...papers);
    }

    // bioRxiv — not query-based, returns latest across all biology
    const biorxivPapers = await fetchLatestBioRxiv('all', PAPERS_PER_SOURCE);
    all.push(...biorxivPapers);

    // Nature RSS
    const naturePapers = await fetchLatestNature(PAPERS_PER_SOURCE);
    all.push(...naturePapers);

    // PLOS ONE RSS
    const plosPapers = await fetchLatestPLOS(PAPERS_PER_SOURCE);
    all.push(...plosPapers);

    // IEEE RSS
    const ieeePapers = await fetchLatestIEEE(undefined, PAPERS_PER_SOURCE);
    all.push(...ieeePapers);

    // Springer RSS
    const springerPapers = await fetchLatestSpringer(PAPERS_PER_SOURCE);
    all.push(...springerPapers);

    return all;
}

// ============================================================================
// Persist fetched papers to DB
// ============================================================================

async function persistPapers(papers: LatestPaperResult[]): Promise<number> {
    let saved = 0;

    for (const paper of papers) {
        try {
            const result = await query(
                `INSERT INTO latest_papers
                    (external_id, source, publisher, title, abstract, url, authors, venue, year, published_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 ON CONFLICT (external_id, publisher) DO UPDATE
                    SET title        = EXCLUDED.title,
                        abstract     = EXCLUDED.abstract,
                        fetched_at   = NOW()
                 RETURNING (xmax = 0) AS inserted`,
                [
                    paper.externalId,
                    paper.source,
                    paper.publisher,
                    paper.title,
                    paper.abstract ?? '',
                    paper.url,
                    paper.authors ?? [],
                    paper.venue ?? '',
                    paper.year ?? new Date().getFullYear(),
                    paper.published ?? new Date(),
                ],
            );
            if (result.rows[0]?.inserted) saved++;
        } catch (err) {
            // Log but don't abort the whole run for a single bad paper
            console.warn('[LatestPapersCron] Failed to persist paper:', paper.title, err);
        }
    }

    return saved;
}

// ============================================================================
// Prune old papers (keep last 90 days)
// ============================================================================

async function pruneOldPapers(): Promise<void> {
    try {
        await query(
            `DELETE FROM latest_papers WHERE fetched_at < NOW() - INTERVAL '90 days'`,
        );
    } catch (err) {
        console.error('[LatestPapersCron] Prune failed:', err);
    }
}

// ============================================================================
// Run once (exported so it can be triggered manually / via API)
// ============================================================================

export async function runLatestPapersFetch(): Promise<{ saved: number; total: number }> {
    let logId: string | null = null;

    try {
        await ensureLatestPapersTables();

        // Record start
        const logResult = await query(
            `INSERT INTO cron_run_log (job_name, status) VALUES ('latest_papers_fetch', 'running') RETURNING id`,
        );
        logId = logResult.rows[0]?.id ?? null;

        console.log('[LatestPapersCron] Starting fetch...');
        const papers = await fetchAllLatestPapers();
        console.log(`[LatestPapersCron] Fetched ${papers.length} papers from all sources`);

        const saved = await persistPapers(papers);
        console.log(`[LatestPapersCron] Saved ${saved} new papers to DB`);

        await pruneOldPapers();

        // Mark success
        if (logId) {
            await query(
                `UPDATE cron_run_log SET status = 'success', finished_at = NOW(), papers_fetched = $2 WHERE id = $1`,
                [logId, saved],
            );
        }

        return { saved, total: papers.length };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[LatestPapersCron] Fatal error:', msg);

        if (logId) {
            await query(
                `UPDATE cron_run_log SET status = 'failed', finished_at = NOW(), error_msg = $2 WHERE id = $1`,
                [logId, msg],
            );
        }

        return { saved: 0, total: 0 };
    }
}

// ============================================================================
// Schedule — runs every day at 06:00 UTC
// ============================================================================

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

export function startLatestPapersCron(): void {
    if (scheduledTask) {
        console.warn('[LatestPapersCron] Already scheduled, skipping');
        return;
    }

    // Cron expression: "0 6 * * *" = every day at 06:00 UTC
    scheduledTask = cron.schedule(
        '0 6 * * *',
        async () => {
            console.log('[LatestPapersCron] Cron triggered at', new Date().toISOString());
            await runLatestPapersFetch();
        },
        {
            timezone: 'UTC',
        },
    );

    console.log('[LatestPapersCron] Scheduled daily at 06:00 UTC');

    // Also run once at startup so data is immediately available
    setImmediate(async () => {
        console.log('[LatestPapersCron] Running initial fetch on startup...');
        await runLatestPapersFetch();
    });
}

export function stopLatestPapersCron(): void {
    scheduledTask?.stop();
    scheduledTask = null;
    console.log('[LatestPapersCron] Stopped');
}
