// ============================================================================
// Import Routes
// Import papers from BibTeX, RIS, ENW, and Zotero API
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db/client.js';
import { requireAuth, checkQuota } from '../middleware/auth.js';
import { parseBibTeX, toPaperRecord as bibtexToPaper } from '../lib/bibtex-parser.js';
import { parseRIS, toPaperRecord as risToPaper } from '../lib/ris-parser.js';

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const BibTeXImportSchema = z.object({
    bibtexContent: z.string().min(1),
    collectionId: z.string().uuid().optional(),
    newCollectionName: z.string().max(255).optional(),
});

const FileImportSchema = z.object({
    content: z.string().min(1),
    filename: z.string(),
    collectionId: z.string().uuid().optional(),
    newCollectionName: z.string().max(255).optional(),
});

const ZoteroImportSchema = z.object({
    zoteroApiKey: z.string().min(1),
    libraryId: z.string().min(1),
    libraryType: z.enum(['user', 'group']).default('user'),
    collectionKey: z.string().optional(),
    collectionId: z.string().uuid().optional(),
    newCollectionName: z.string().max(255).optional(),
});

// ============================================================================
// Supported formats metadata
// ============================================================================

const SUPPORTED_FORMATS = [
    {
        id: 'bibtex',
        name: 'BibTeX',
        extensions: ['.bib'],
        description: 'Standard BibTeX format used by LaTeX and reference managers',
    },
    {
        id: 'ris',
        name: 'RIS',
        extensions: ['.ris'],
        description: 'Research Information Systems format (EndNote, ProCite)',
    },
    {
        id: 'enw',
        name: 'ENW',
        extensions: ['.enw'],
        description: 'EndNote tag format',
    },
    {
        id: 'zotero',
        name: 'Zotero API',
        extensions: [],
        description: 'Direct import from Zotero via Web API v3',
    },
];

// ============================================================================
// GET /import/formats — List supported import formats
// ============================================================================

router.get('/formats', (_req: Request, res: Response): void => {
    res.json({ formats: SUPPORTED_FORMATS });
});

// ============================================================================
// POST /import/bibtex — Import from BibTeX content
// ============================================================================

router.post('/bibtex', requireAuth, checkQuota('papers'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = BibTeXImportSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { bibtexContent, collectionId, newCollectionName } = parsed.data;
        const userId = req.user!.userId;

        const papers = parseBibTeX(bibtexContent);

        const imported: any[] = [];
        const errors: string[] = [];
        let skipped = 0;

        // Get existing URLs to detect duplicates
        const existingUrls = new Set(
            (
                await query(`SELECT url FROM papers WHERE user_id = $1`, [userId])
            ).rows.map((r: any) => r.url)
        );

        for (const paper of papers) {
            try {
                const record = bibtexToPaper(paper, userId);

                // Skip duplicates
                if (existingUrls.has(record.url)) {
                    skipped++;
                    continue;
                }

                const result = await transaction(async (client) => {
                    // Insert paper
                    const insertResult = await client.query(
                        `INSERT INTO papers (user_id, url, title, abstract, authors, venue, year, content, source, metadata)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                         RETURNING *`,
                        [
                            record.user_id, record.url, record.title, record.abstract,
                            record.authors, record.venue, record.year, record.content,
                            record.source, JSON.stringify(record.metadata),
                        ]
                    );

                    const paperId = insertResult.rows[0].id;

                    // Add to collection if specified
                    if (collectionId) {
                        await client.query(
                            `INSERT INTO collection_papers (collection_id, paper_id)
                             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                            [collectionId, paperId]
                        );
                    }

                    // Update usage stats
                    await client.query(
                        `UPDATE usage_records SET papers_processed = papers_processed + 1, last_updated = NOW()
                         WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()`,
                        [userId]
                    );

                    return insertResult.rows[0];
                });

                existingUrls.add(record.url);
                imported.push(result);
            } catch (err: any) {
                errors.push(`Failed to import "${paper.title}": ${err.message}`);
            }
        }

        // Create new collection if requested
        let targetCollectionId = collectionId;
        if (newCollectionName && !collectionId) {
            const collResult = await query(
                `INSERT INTO collections (user_id, name, description) VALUES ($1, $2, $3) RETURNING id`,
                [userId, newCollectionName, `Imported from BibTeX on ${new Date().toISOString().split('T')[0]}`]
            );
            targetCollectionId = collResult.rows[0].id;

            // Add all imported papers to new collection
            if (imported.length > 0) {
                for (const paper of imported) {
                    await query(
                        `INSERT INTO collection_papers (collection_id, paper_id)
                         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                        [targetCollectionId, paper.id]
                    );
                }
            }
        }

        res.json({
            imported: imported.length,
            skipped,
            errors,
            papers: imported,
            collectionId: targetCollectionId,
        });
    } catch (error) {
        console.error('[Import] BibTeX error:', error);
        res.status(500).json({ error: 'Failed to import BibTeX content' });
    }
});

// ============================================================================
// POST /import/file — Import from uploaded file content
// ============================================================================

router.post('/file', requireAuth, checkQuota('papers'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = FileImportSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { content, filename, collectionId, newCollectionName } = parsed.data;
        const userId = req.user!.userId;

        const ext = filename.toLowerCase().split('.').pop();
        let papers: any[];
        let toPaper: (p: any, userId: string) => any;

        switch (ext) {
            case 'bib':
                papers = parseBibTeX(content);
                toPaper = bibtexToPaper;
                break;
            case 'ris':
                papers = parseRIS(content);
                toPaper = risToPaper;
                break;
            case 'enw':
                // ENW is a variant of RIS with different tag format
                papers = parseRIS(convertENWtoRIS(content));
                toPaper = risToPaper;
                break;
            default:
                res.status(400).json({
                    error: `Unsupported file format: .${ext}`,
                    supported: SUPPORTED_FORMATS.flatMap(f => f.extensions),
                });
                return;
        }

        const imported: any[] = [];
        const errors: string[] = [];
        let skipped = 0;

        // Get existing URLs to detect duplicates
        const existingUrls = new Set(
            (
                await query(`SELECT url FROM papers WHERE user_id = $1`, [userId])
            ).rows.map((r: any) => r.url)
        );

        for (const paper of papers) {
            try {
                const record = toPaper(paper, userId);

                if (existingUrls.has(record.url)) {
                    skipped++;
                    continue;
                }

                const result = await transaction(async (client) => {
                    const insertResult = await client.query(
                        `INSERT INTO papers (user_id, url, title, abstract, authors, venue, year, content, source, metadata)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                         RETURNING *`,
                        [
                            record.user_id, record.url, record.title, record.abstract,
                            record.authors, record.venue, record.year, record.content,
                            record.source, JSON.stringify(record.metadata),
                        ]
                    );

                    const paperId = insertResult.rows[0].id;

                    if (collectionId) {
                        await client.query(
                            `INSERT INTO collection_papers (collection_id, paper_id)
                             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                            [collectionId, paperId]
                        );
                    }

                    await client.query(
                        `UPDATE usage_records SET papers_processed = papers_processed + 1, last_updated = NOW()
                         WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()`,
                        [userId]
                    );

                    return insertResult.rows[0];
                });

                existingUrls.add(record.url);
                imported.push(result);
            } catch (err: any) {
                errors.push(`Failed to import "${paper.title || 'unknown'}": ${err.message}`);
            }
        }

        // Create new collection if requested
        let targetCollectionId = collectionId;
        if (newCollectionName && !collectionId) {
            const collResult = await query(
                `INSERT INTO collections (user_id, name, description) VALUES ($1, $2, $3) RETURNING id`,
                [userId, newCollectionName, `Imported from ${ext} file on ${new Date().toISOString().split('T')[0]}`]
            );
            targetCollectionId = collResult.rows[0].id;

            for (const paper of imported) {
                await query(
                    `INSERT INTO collection_papers (collection_id, paper_id)
                     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [targetCollectionId, paper.id]
                );
            }
        }

        res.json({
            imported: imported.length,
            skipped,
            errors,
            papers: imported,
            collectionId: targetCollectionId,
        });
    } catch (error) {
        console.error('[Import] File error:', error);
        res.status(500).json({ error: 'Failed to import file' });
    }
});

// ============================================================================
// POST /import/zotero — Import from Zotero Web API v3
// ============================================================================

router.post('/zotero', requireAuth, checkQuota('papers'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = ZoteroImportSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { zoteroApiKey, libraryId, libraryType, collectionKey, collectionId, newCollectionName } = parsed.data;
        const userId = req.user!.userId;

        // Build Zotero API URL
        let apiUrl = `https://api.zotero.org/${libraryType}s/${libraryId}/items`;
        const params = new URLSearchParams({
            format: 'json',
            limit: '100',
            sort: 'dateModified',
            direction: 'desc',
        });

        if (collectionKey) {
            params.set('collection', collectionKey);
        }

        const allItems: any[] = [];
        let start = 0;
        let totalResults = Infinity;

        // Paginate through all items
        while (start < totalResults && start < 1000) { // Cap at 1000 items
            params.set('start', String(start));
            const response = await fetch(`${apiUrl}?${params.toString()}`, {
                headers: {
                    'Zotero-API-Key': zoteroApiKey,
                    'Zotero-API-Version': '3',
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                res.status(response.status).json({
                    error: `Zotero API error: ${response.status}`,
                    details: errorText,
                });
                return;
            }

            const totalHeader = response.headers.get('Total-Results');
            if (totalHeader) totalResults = parseInt(totalHeader, 10);

            const items = (await response.json()) as any[];
            if (!Array.isArray(items)) break;
            allItems.push(...items);

            if (items.length === 0) break;
            start += items.length;
        }

        // Convert Zotero items to BibTeX-like format for parsing
        const papers: any[] = [];
        const imported: any[] = [];
        const errors: string[] = [];
        let skipped = 0;

        // Get existing URLs to detect duplicates
        const existingUrls = new Set(
            (
                await query(`SELECT url FROM papers WHERE user_id = $1`, [userId])
            ).rows.map((r: any) => r.url)
        );

        for (const item of allItems) {
            try {
                const data = item.data;
                if (!data || data.itemType === 'attachment' || data.itemType === 'note') {
                    continue;
                }

                const title = data.title || '';
                if (!title) continue;

                const authors = (data.creators || []).map((c: any) => {
                    if (c.creatorType === 'author') {
                        return c.name || `${c.lastName || ''}, ${c.firstName || ''}`.trim();
                    }
                    return null;
                }).filter(Boolean);

                const year = data.date ? parseInt(data.date.match(/\d{4}/)?.[0] || '', 10) : null;
                const doi = data.DOI || null;
                const url = data.url || (doi ? `https://doi.org/${doi}` : null);
                const venue = data.publicationTitle || data.proceedingsTitle || data.bookTitle || null;

                const record = {
                    user_id: userId,
                    url: url || `zotero://import/${encodeURIComponent(title)}`,
                    title,
                    abstract: data.abstractNote || null,
                    authors,
                    venue,
                    year: year && !isNaN(year) ? year : null,
                    content: null,
                    source: 'zotero_import',
                    metadata: {
                        zoteroKey: data.key,
                        zoteroItemType: data.itemType,
                        doi,
                        tags: (data.tags || []).map((t: any) => t.tag),
                        publisher: data.publisher || null,
                        pages: data.pages || null,
                        volume: data.volume || null,
                        issue: data.issue || null,
                    },
                };

                if (existingUrls.has(record.url)) {
                    skipped++;
                    continue;
                }

                const result = await transaction(async (client) => {
                    const insertResult = await client.query(
                        `INSERT INTO papers (user_id, url, title, abstract, authors, venue, year, content, source, metadata)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                         RETURNING *`,
                        [
                            record.user_id, record.url, record.title, record.abstract,
                            record.authors, record.venue, record.year, record.content,
                            record.source, JSON.stringify(record.metadata),
                        ]
                    );

                    const paperId = insertResult.rows[0].id;

                    if (collectionId) {
                        await client.query(
                            `INSERT INTO collection_papers (collection_id, paper_id)
                             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                            [collectionId, paperId]
                        );
                    }

                    await client.query(
                        `UPDATE usage_records SET papers_processed = papers_processed + 1, last_updated = NOW()
                         WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()`,
                        [userId]
                    );

                    return insertResult.rows[0];
                });

                existingUrls.add(record.url);
                imported.push(result);
            } catch (err: any) {
                errors.push(`Failed to import item: ${err.message}`);
            }
        }

        // Create new collection if requested
        let targetCollectionId = collectionId;
        if (newCollectionName && !collectionId) {
            const collResult = await query(
                `INSERT INTO collections (user_id, name, description) VALUES ($1, $2, $3) RETURNING id`,
                [userId, newCollectionName, `Imported from Zotero on ${new Date().toISOString().split('T')[0]}`]
            );
            targetCollectionId = collResult.rows[0].id;

            for (const paper of imported) {
                await query(
                    `INSERT INTO collection_papers (collection_id, paper_id)
                     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [targetCollectionId, paper.id]
                );
            }
        }

        res.json({
            imported: imported.length,
            skipped,
            errors,
            papers: imported,
            collectionId: targetCollectionId,
            totalFromZotero: allItems.length,
        });
    } catch (error) {
        console.error('[Import] Zotero error:', error);
        res.status(500).json({ error: 'Failed to import from Zotero' });
    }
});

// ============================================================================
// POST /import/preview — Preview parsed papers before importing
// ============================================================================

router.post('/preview', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { content, filename } = req.body;

        if (!content || !filename) {
            res.status(400).json({ error: 'content and filename are required' });
            return;
        }

        const ext = filename.toLowerCase().split('.').pop();
        let papers: any[];

        switch (ext) {
            case 'bib':
                papers = parseBibTeX(content);
                break;
            case 'ris':
                papers = parseRIS(content);
                break;
            case 'enw':
                papers = parseRIS(convertENWtoRIS(content));
                break;
            default:
                res.status(400).json({ error: `Unsupported format: .${ext}` });
                return;
        }

        res.json({
            total: papers.length,
            papers: papers.map(p => ({
                title: p.title,
                authors: p.authors,
                year: p.year,
                venue: p.venue,
                doi: p.doi,
            })),
        });
    } catch (error) {
        console.error('[Import] Preview error:', error);
        res.status(500).json({ error: 'Failed to preview file' });
    }
});

// ============================================================================
// HELPER: Convert ENW format to RIS
// ============================================================================

function convertENWtoRIS(enwContent: string): string {
    // ENW format uses % tags instead of RIS XX tags
    const lines = enwContent.split(/\r?\n/);
    const risLines: string[] = [];

    for (const line of lines) {
        if (line.startsWith('%T')) risLines.push(`TI  - ${line.slice(2).trim()}`);
        else if (line.startsWith('%A')) risLines.push(`AU  - ${line.slice(2).trim()}`);
        else if (line.startsWith('%D')) risLines.push(`PY  - ${line.slice(2).trim()}`);
        else if (line.startsWith('%X')) risLines.push(`AB  - ${line.slice(2).trim()}`);
        else if (line.startsWith('%R')) risLines.push(`DO  - ${line.slice(2).trim()}`);
        else if (line.startsWith('%U')) risLines.push(`UR  - ${line.slice(2).trim()}`);
        else if (line.startsWith('%J')) risLines.push(`JO  - ${line.slice(2).trim()}`);
        else if (line.startsWith('%P')) risLines.push(`SP  - ${line.slice(2).trim()}`);
        else if (line.startsWith('%@')) risLines.push(`PB  - ${line.slice(2).trim()}`);
        else if (line.startsWith('%K')) risLines.push(`KW  - ${line.slice(2).trim()}`);
        else if (line.startsWith('%0')) risLines.push(`TY  - ${mapENWType(line.slice(2).trim())}`);
    }

    risLines.push('ER  - ');
    return risLines.join('\n');
}

function mapENWType(enwType: string): string {
    const map: Record<string, string> = {
        'Journal Article': 'JOUR',
        'Book': 'BOOK',
        'Book Section': 'CHAPT',
        'Conference Paper': 'CONF',
        'Thesis': 'THES',
        'Report': 'RPRT',
    };
    return map[enwType] || 'MISC';
}

export default router;
