// ============================================================================
// Paper Sources Library
// Fetch papers from arXiv and Semantic Scholar APIs
// ============================================================================

import { z } from 'zod';

export interface ExternalPaper {
    externalId: string;
    source: 'arxiv' | 'semantic_scholar';
    title: string;
    abstract: string;
    url: string;
    authors: string[];
    venue: string;
    year: number;
    published: Date;
}

// ============================================================================
// arXiv API Client
// ============================================================================

export async function searchArxiv(query: string, limit: number = 10, offset: number = 0): Promise<ExternalPaper[]> {
    try {
        const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=${offset}&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`;
        const response = await fetch(url);
        const xml = await response.text();

        return parseArxivAtom(xml);
    } catch (error) {
        console.error('[PaperSources] arXiv search error:', error);
        return [];
    }
}

function parseArxivAtom(xml: string): ExternalPaper[] {
    const papers: ExternalPaper[] = [];
    const entries = xml.split('<entry>');

    for (let i = 1; i < entries.length; i++) {
        const entry = entries[i].split('</entry>')[0];
        try {
            const idMatch = entry.match(/<id>(.*?)<\/id>/);
            const titleMatch = entry.match(/<title>(.*?)<\/title>/s);
            const summaryMatch = entry.match(/<summary>(.*?)<\/summary>/s);
            const publishedMatch = entry.match(/<published>(.*?)<\/published>/);
            const authorsMatch = entry.matchAll(/<author>\s*<name>(.*?)<\/name>\s*<\/author>/g);
            const linksMatch = entry.match(/<link\s+title="pdf"\s+href="(.*?)"/);
            const arxivUrlMatch = entry.match(/<id>http:\/\/arxiv\.org\/abs\/(.*?)<\/id>/);

            const externalId = arxivUrlMatch ? arxivUrlMatch[1] : (idMatch ? idMatch[1] : `arxiv-${Date.now()}-${i}`);
            const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : 'Unknown Title';
            const abstract = summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim() : '';
            const published = publishedMatch ? new Date(publishedMatch[1]) : new Date();
            const year = published.getFullYear();
            const url = linksMatch ? linksMatch[1] : (arxivUrlMatch ? `http://arxiv.org/abs/${arxivUrlMatch[1]}` : '');

            const authors: string[] = [];
            for (const match of authorsMatch) {
                authors.push(match[1]);
            }

            papers.push({
                externalId,
                source: 'arxiv',
                title,
                abstract,
                url,
                authors,
                venue: 'arXiv',
                year,
                published,
            });
        } catch (e) {
            console.warn('[PaperSources] Failed to parse arXiv entry', e);
        }
    }

    return papers;
}

// ============================================================================
// Semantic Scholar API Client
// ============================================================================

export async function searchSemanticScholar(query: string, limit: number = 10): Promise<ExternalPaper[]> {
    try {
        const fields = 'paperId,title,abstract,url,year,venue,authors,publicationDate';
        const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`;

        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 429) console.warn('[PaperSources] Semantic Scholar rate limited');
            return [];
        }

        const data: any = await response.json();
        if (!data.data || !Array.isArray(data.data)) return [];

        return data.data.map((p: any) => ({
            externalId: p.paperId,
            source: 'semantic_scholar',
            title: p.title || 'Unknown Title',
            abstract: p.abstract || '',
            url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
            authors: (p.authors || []).map((a: any) => a.name),
            venue: p.venue || 'Unknown',
            year: p.year || new Date().getFullYear(),
            published: p.publicationDate ? new Date(p.publicationDate) : new Date(p.year || new Date().getFullYear(), 0, 1),
        }));
    } catch (error) {
        console.error('[PaperSources] Semantic Scholar search error:', error);
        return [];
    }
}

// ============================================================================
// Famous Publishers — used by the Latest Papers cron job
// ============================================================================

export type FamousPublisher =
    | 'arxiv'
    | 'pubmed'
    | 'crossref'
    | 'biorxiv'
    | 'nature'
    | 'ieee'
    | 'springer'
    | 'plos';

export interface LatestPaperResult extends ExternalPaper {
    publisher: FamousPublisher;
}

// --- PubMed (NCBI E-utilities) ---
export async function fetchLatestPubMed(query: string, limit = 10): Promise<LatestPaperResult[]> {
    try {
        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        const searchUrl = `${baseUrl}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&sort=date&retmode=json`;

        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) return [];
        const searchData: any = await searchRes.json();
        const ids: string[] = searchData?.esearchresult?.idlist ?? [];
        if (ids.length === 0) return [];

        const fetchUrl = `${baseUrl}/efetch.fcgi?db=pubmed&id=${ids.join(',')}&rettype=xml&retmode=xml`;
        const fetchRes = await fetch(fetchUrl);
        if (!fetchRes.ok) return [];
        const xml = await fetchRes.text();

        return parsePubMedXml(xml);
    } catch (error) {
        console.error('[PaperSources] PubMed fetch error:', error);
        return [];
    }
}

function parsePubMedXml(xml: string): LatestPaperResult[] {
    const papers: LatestPaperResult[] = [];
    const articles = xml.split('<PubmedArticle>');

    for (let i = 1; i < articles.length; i++) {
        const article = articles[i].split('</PubmedArticle>')[0];
        try {
            const pmidMatch = article.match(/<PMID[^>]*>(.*?)<\/PMID>/);
            const titleMatch = article.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/s);
            const abstractMatch = article.match(/<AbstractText[^>]*>(.*?)<\/AbstractText>/s);
            const yearMatch = article.match(/<PubDate>[\s\S]*?<Year>(.*?)<\/Year>/);
            const monthMatch = article.match(/<PubDate>[\s\S]*?<Month>(.*?)<\/Month>/);
            const authorMatches = [...article.matchAll(/<LastName>(.*?)<\/LastName>[\s\S]*?<ForeName>(.*?)<\/ForeName>/g)];
            const journalMatch = article.match(/<Title>(.*?)<\/Title>/);

            const pmid = pmidMatch?.[1] ?? `pubmed-${i}`;
            const title = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? 'Unknown Title';
            const abstract = abstractMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
            const year = parseInt(yearMatch?.[1] ?? String(new Date().getFullYear()));
            const month = monthMatch?.[1] ?? 'Jan';
            const authors = authorMatches.map(m => `${m[1]} ${m[2]}`);
            const venue = journalMatch?.[1] ?? 'PubMed';

            papers.push({
                externalId: pmid,
                source: 'arxiv', // mapped to generic; actual source tracked via publisher field
                publisher: 'pubmed',
                title,
                abstract,
                url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                authors,
                venue,
                year,
                published: new Date(`${month} 1, ${year}`),
            });
        } catch {
            // skip malformed entry
        }
    }

    return papers;
}

// --- CrossRef (broad multi-publisher coverage) ---
export async function fetchLatestCrossRef(query: string, limit = 10): Promise<LatestPaperResult[]> {
    try {
        const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}&sort=published&order=desc&filter=type:journal-article`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'GapMiner/1.0 (https://gapminer.app; mailto:support@gapminer.app)' },
        });
        if (!res.ok) return [];
        const data: any = await res.json();
        const items: any[] = data?.message?.items ?? [];

        return items.map((item: any): LatestPaperResult => {
            const doi = item.DOI ?? '';
            const pubDate = item.published?.['date-parts']?.[0];
            const year = pubDate?.[0] ?? new Date().getFullYear();
            const month = pubDate?.[1] ?? 1;
            const day = pubDate?.[2] ?? 1;
            return {
                externalId: doi,
                source: 'semantic_scholar',
                publisher: 'crossref',
                title: (item.title?.[0] ?? 'Unknown Title').replace(/<[^>]+>/g, '').trim(),
                abstract: (item.abstract ?? '').replace(/<[^>]+>/g, '').trim(),
                url: `https://doi.org/${doi}`,
                authors: (item.author ?? []).map((a: any) => `${a.given ?? ''} ${a.family ?? ''}`.trim()),
                venue: item['container-title']?.[0] ?? item.publisher ?? 'CrossRef',
                year,
                published: new Date(year, month - 1, day),
            };
        });
    } catch (error) {
        console.error('[PaperSources] CrossRef fetch error:', error);
        return [];
    }
}

// --- bioRxiv (preprint RSS) ---
export async function fetchLatestBioRxiv(category = 'all', limit = 10): Promise<LatestPaperResult[]> {
    try {
        // bioRxiv JSON API returns the 30 most recent papers per category
        const url = `https://api.biorxiv.org/details/biorxiv/2000-01-01/${new Date().toISOString().split('T')[0]}/${0}/${Math.min(limit, 30)}/json`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data: any = await res.json();
        const collection: any[] = data?.collection ?? [];

        return collection.slice(0, limit).map((item: any): LatestPaperResult => ({
            externalId: item.doi ?? `biorxiv-${item.title}`,
            source: 'arxiv',
            publisher: 'biorxiv',
            title: item.title ?? 'Unknown Title',
            abstract: item.abstract ?? '',
            url: `https://www.biorxiv.org/content/${item.doi}v${item.version ?? 1}`,
            authors: (item.authors ?? '').split('; ').filter(Boolean),
            venue: 'bioRxiv',
            year: item.date ? new Date(item.date).getFullYear() : new Date().getFullYear(),
            published: item.date ? new Date(item.date) : new Date(),
        }));
    } catch (error) {
        console.error('[PaperSources] bioRxiv fetch error:', error);
        return [];
    }
}

// --- Nature RSS ---
export async function fetchLatestNature(limit = 10): Promise<LatestPaperResult[]> {
    try {
        const url = 'https://www.nature.com/nature.rss';
        const res = await fetch(url, { headers: { 'User-Agent': 'GapMiner/1.0' } });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRssItems(xml, 'nature', 'Nature', limit);
    } catch (error) {
        console.error('[PaperSources] Nature RSS fetch error:', error);
        return [];
    }
}

// --- PLOS ONE RSS ---
export async function fetchLatestPLOS(limit = 10): Promise<LatestPaperResult[]> {
    try {
        const url = 'https://journals.plos.org/plosone/feed/atom';
        const res = await fetch(url, { headers: { 'User-Agent': 'GapMiner/1.0' } });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseAtomItems(xml, 'plos', 'PLOS ONE', limit);
    } catch (error) {
        console.error('[PaperSources] PLOS fetch error:', error);
        return [];
    }
}

// --- IEEE Xplore RSS ---
export async function fetchLatestIEEE(topic = 'artificial intelligence', limit = 10): Promise<LatestPaperResult[]> {
    try {
        const url = `https://ieeexplore.ieee.org/rss/TOC/5.XML`; // IEEE Transactions on Neural Networks
        const res = await fetch(url, { headers: { 'User-Agent': 'GapMiner/1.0' } });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRssItems(xml, 'ieee', 'IEEE', limit);
    } catch (error) {
        console.error('[PaperSources] IEEE RSS fetch error:', error);
        return [];
    }
}

// --- Springer Open Access RSS ---
export async function fetchLatestSpringer(limit = 10): Promise<LatestPaperResult[]> {
    try {
        const url = 'https://link.springer.com/search.rss?facet-content-type=Article&query=&search-within=Journal';
        const res = await fetch(url, { headers: { 'User-Agent': 'GapMiner/1.0' } });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRssItems(xml, 'springer', 'Springer', limit);
    } catch (error) {
        console.error('[PaperSources] Springer RSS fetch error:', error);
        return [];
    }
}

// ============================================================================
// RSS/Atom parsers (shared)
// ============================================================================

function parseRssItems(xml: string, publisher: FamousPublisher, venueName: string, limit: number): LatestPaperResult[] {
    const papers: LatestPaperResult[] = [];
    const items = xml.split('<item>');

    for (let i = 1; i < items.length && papers.length < limit; i++) {
        const item = items[i].split('</item>')[0];
        try {
            const titleMatch = item.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<title[^>]*>(.*?)<\/title>/s);
            const linkMatch = item.match(/<link[^>]*>(.*?)<\/link>|<link[^>]*href="([^"]+)"/);
            const descMatch = item.match(/<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>|<description[^>]*>(.*?)<\/description>/s);
            const pubDateMatch = item.match(/<pubDate[^>]*>(.*?)<\/pubDate>/);
            const authorMatch = item.match(/<dc:creator[^>]*>(.*?)<\/dc:creator>|<author[^>]*>(.*?)<\/author>/);
            const guidMatch = item.match(/<guid[^>]*>(.*?)<\/guid>/);

            const title = (titleMatch?.[1] ?? titleMatch?.[2] ?? 'Unknown Title').replace(/<[^>]+>/g, '').trim();
            const url = (linkMatch?.[1] ?? linkMatch?.[2] ?? '').trim();
            const abstract = (descMatch?.[1] ?? descMatch?.[2] ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 1000);
            const published = pubDateMatch ? new Date(pubDateMatch[1]) : new Date();
            const author = (authorMatch?.[1] ?? authorMatch?.[2] ?? '').replace(/<[^>]+>/g, '').trim();
            const externalId = guidMatch?.[1] ?? url;

            if (!title || !url) continue;

            papers.push({
                externalId,
                source: 'arxiv',
                publisher,
                title,
                abstract,
                url,
                authors: author ? [author] : [],
                venue: venueName,
                year: published.getFullYear(),
                published,
            });
        } catch {
            // skip
        }
    }

    return papers;
}

function parseAtomItems(xml: string, publisher: FamousPublisher, venueName: string, limit: number): LatestPaperResult[] {
    const papers: LatestPaperResult[] = [];
    const entries = xml.split('<entry>');

    for (let i = 1; i < entries.length && papers.length < limit; i++) {
        const entry = entries[i].split('</entry>')[0];
        try {
            const titleMatch = entry.match(/<title[^>]*>(.*?)<\/title>/s);
            const linkMatch = entry.match(/<link[^>]*href="([^"]+)"/);
            const summaryMatch = entry.match(/<summary[^>]*>(.*?)<\/summary>/s);
            const updatedMatch = entry.match(/<updated>(.*?)<\/updated>/);
            const authorMatch = entry.match(/<author>[\s\S]*?<name>(.*?)<\/name>/);
            const idMatch = entry.match(/<id>(.*?)<\/id>/);

            const title = (titleMatch?.[1] ?? 'Unknown Title').replace(/<[^>]+>/g, '').trim();
            const url = linkMatch?.[1] ?? '';
            const abstract = (summaryMatch?.[1] ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 1000);
            const published = updatedMatch ? new Date(updatedMatch[1]) : new Date();
            const author = (authorMatch?.[1] ?? '').trim();
            const externalId = idMatch?.[1] ?? url;

            if (!title || !url) continue;

            papers.push({
                externalId,
                source: 'arxiv',
                publisher,
                title,
                abstract,
                url,
                authors: author ? [author] : [],
                venue: venueName,
                year: published.getFullYear(),
                published,
            });
        } catch {
            // skip
        }
    }

    return papers;
}
