// ============================================================================
// RIS (Research Information Systems) Parser
// Parses RIS format content into structured paper objects
// ============================================================================

export interface RISEntry {
    type: string;
    tags: Record<string, string[]>;
}

export interface ParsedRISPaper {
    title: string;
    authors: string[];
    year: number | null;
    abstract: string | null;
    doi: string | null;
    url: string | null;
    venue: string | null;
    publisher: string | null;
    type: string;
    rawTags: Record<string, string[]>;
}

const TAG_DESCRIPTIONS: Record<string, string> = {
    'TY': 'Type',
    'TI': 'Title',
    'AU': 'Author',
    'PY': 'Publication Year',
    'AB': 'Abstract',
    'DO': 'DOI',
    'UR': 'URL',
    'JO': 'Journal',
    'PB': 'Publisher',
    'VL': 'Volume',
    'IS': 'Issue',
    'SP': 'Start Page',
    'EP': 'End Page',
    'KW': 'Keyword',
    'AN': 'Accession Number',
    'SN': 'ISSN',
    'DA': 'Date',
    'DB': 'Database',
    'ER': 'End of Record',
};

/**
 * Parse RIS content into individual entries
 */
function splitRISEntries(content: string): string[] {
    const entries: string[] = [];
    const lines = content.split(/\r?\n/);
    let currentEntry: string[] = [];

    for (const line of lines) {
        if (line.startsWith('ER  -')) {
            currentEntry.push(line);
            entries.push(currentEntry.join('\n'));
            currentEntry = [];
        } else if (line.match(/^[A-Z][A-Z0-9]  -/)) {
            currentEntry.push(line);
        }
    }

    // Handle last entry if no ER line
    if (currentEntry.length > 0) {
        entries.push(currentEntry.join('\n'));
    }

    return entries.filter(e => e.trim().length > 0);
}

/**
 * Parse a single RIS entry
 */
function parseRISEntry(content: string): RISEntry {
    const tags: Record<string, string[]> = {};
    let type = 'misc';

    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const match = line.match(/^([A-Z][A-Z0-9])  -\s*(.*)/);
        if (!match) continue;

        const tag = match[1];
        const value = match[2].trim();

        if (tag === 'TY') {
            type = value.toLowerCase();
        } else if (tag === 'ER') {
            continue;
        } else {
            if (!tags[tag]) tags[tag] = [];
            tags[tag].push(value);
        }
    }

    return { type, tags };
}

/**
 * Map RIS type to a human-readable format
 */
function mapRISType(risType: string): string {
    const typeMap: Record<string, string> = {
        'jour': 'article',
        'article': 'article',
        'conf': 'inproceedings',
        'inconf': 'inproceedings',
        'book': 'book',
        'chapt': 'incollection',
        'chapter': 'incollection',
        'thed': 'phdthesis',
        'thesis': 'phdthesis',
        'unpb': 'misc',
        'rprt': 'techreport',
        'report': 'techreport',
    };
    return typeMap[risType] || risType;
}

/**
 * Parse RIS content into structured paper objects
 */
export function parseRIS(content: string): ParsedRISPaper[] {
    const entries = splitRISEntries(content);
    const papers: ParsedRISPaper[] = [];

    for (const entryContent of entries) {
        const entry = parseRISEntry(entryContent);

        const title = (entry.tags['TI'] || entry.tags['T1'] || [])[0] || '';
        if (!title) continue;

        const authors = entry.tags['AU'] || [];
        const yearStr = (entry.tags['PY'] || entry.tags['DA'] || [])[0];
        let year: number | null = null;
        if (yearStr) {
            const match = yearStr.match(/\d{4}/);
            if (match) year = parseInt(match[0], 10);
        }

        const abstract = (entry.tags['AB'] || [])[0] || null;
        const doi = (entry.tags['DO'] || [])[0] || null;
        const url = (entry.tags['UR'] || entry.tags['L1'] || entry.tags['L2'] || [])[0] || null;
        const venue = (entry.tags['JO'] || entry.tags['JA'] || entry.tags['J2'] || [])[0] || null;
        const publisher = (entry.tags['PB'] || [])[0] || null;

        papers.push({
            title: title.trim(),
            authors: authors.map(a => a.trim()),
            year,
            abstract,
            doi,
            url,
            venue,
            publisher,
            type: mapRISType(entry.type),
            rawTags: entry.tags,
        });
    }

    return papers;
}

/**
 * Convert a parsed RIS paper to the format expected by the papers table
 */
export function toPaperRecord(paper: ParsedRISPaper, userId: string) {
    const url = paper.url
        || (paper.doi ? `https://doi.org/${paper.doi}` : `ris://imported/${encodeURIComponent(paper.title)}`);

    return {
        user_id: userId,
        url,
        title: paper.title,
        abstract: paper.abstract,
        authors: paper.authors,
        venue: paper.venue,
        year: paper.year,
        content: null,
        source: 'ris_import',
        metadata: {
            risType: paper.type,
            doi: paper.doi,
            publisher: paper.publisher,
            ...Object.fromEntries(
                Object.entries(paper.rawTags).map(([k, v]) => [k, v.length === 1 ? v[0] : v])
            ),
        },
    };
}
