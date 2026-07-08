// ============================================================================
// BibTeX Parser
// Parses BibTeX content into structured paper objects
// ============================================================================

export interface BibTeXEntry {
    type: string;
    key: string;
    fields: Record<string, string>;
}

export interface ParsedPaper {
    title: string;
    authors: string[];
    year: number | null;
    abstract: string | null;
    doi: string | null;
    url: string | null;
    venue: string | null;
    type: string;
    bibtexKey: string;
    rawFields: Record<string, string>;
}

const ENTRY_TYPES = new Set([
    'article', 'inproceedings', 'book', 'phdthesis', 'mastersthesis',
    'misc', 'incollection', 'proceedings', 'techreport', 'unpublished',
    'inbook', 'booklet', 'manual',
]);

const FIELD_MAP: Record<string, keyof ParsedPaper> = {
    title: 'title',
    author: 'authors',
    year: 'year',
    abstract: 'abstract',
    doi: 'doi',
    url: 'url',
    journal: 'venue',
    booktitle: 'venue',
    publisher: 'rawFields',
    pages: 'rawFields',
    volume: 'rawFields',
    number: 'rawFields',
};

/**
 * Decode common LaTeX/BibTeX special characters
 */
function decodeSpecialChars(text: string): string {
    return text
        // LaTeX accents
        .replace(/\\'{o}/g, 'o').replace(/\\'{a}/g, 'a').replace(/\\'{e}/g, 'e')
        .replace(/\\'{u}/g, 'u').replace(/\\'{i}/g, 'i').replace(/\\'{n}/g, 'n')
        .replace(/\\~{n}/g, 'n').replace(/\\^{e}/g, 'e').replace(/\\^{a}/g, 'a')
        .replace(/\\^{o}/g, 'o').replace(/\\^{u}/g, 'u').replace(/\\^{i}/g, 'i')
        .replace(/\\c{c}/g, 'c').replace(/\\c{s}/g, 's')
        .replace(/\\={a}/g, 'a').replace(/\\={e}/g, 'e').replace(/\\={i}/g, 'i')
        .replace(/\\={o}/g, 'o').replace(/\\={u}/g, 'u')
        // Common commands
        .replace(/\\aa/g, 'a').replace(/\\AA/g, 'A')
        .replace(/\\o/g, 'o').replace(/\\O/g, 'O')
        .replace(/\\ss/g, 'ss')
        .replace(/\\&/g, '&').replace(/\\%/g, '%').replace(/\\#/g, '#')
        .replace(/\\\$/g, '$')
        .replace(/\\cite\{[^}]*\}/g, '')
        .replace(/\\textbf\{([^}]*)\}/g, '$1')
        .replace(/\\textit\{([^}]*)\}/g, '$1')
        .replace(/\\emph\{([^}]*)\}/g, '$1')
        .replace(/\\text\{([^}]*)\}/g, '$1')
        .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
        // HTML entities
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, ' ')
        // Remaining commands
        .replace(/\\[a-zA-Z]+/g, '')
        .replace(/[{}]/g, '')
        .trim();
}

/**
 * Parse authors field (handle "and" separated names)
 */
function parseAuthors(raw: string): string[] {
    return raw
        .split(/\s+and\s+/i)
        .map(a => decodeSpecialChars(a.trim()))
        .filter(a => a.length > 0);
}

/**
 * Extract field value from BibTeX content, handling braces and quotes
 */
function extractFieldValue(content: string, fieldStart: number): { value: string; end: number } {
    let i = fieldStart;
    // Skip whitespace and equals sign
    while (i < content.length && (content[i] === ' ' || content[i] === '=' || content[i] === '\n' || content[i] === '\r')) {
        i++;
    }

    if (i >= content.length) return { value: '', end: i };

    // Quoted value
    if (content[i] === '"') {
        i++;
        let value = '';
        while (i < content.length && content[i] !== '"') {
            value += content[i];
            i++;
        }
        return { value: value.trim(), end: i + 1 };
    }

    // Braced value (handle nested braces)
    if (content[i] === '{') {
        i++;
        let braceCount = 1;
        let value = '';
        while (i < content.length && braceCount > 0) {
            if (content[i] === '{') braceCount++;
            else if (content[i] === '}') braceCount--;
            if (braceCount > 0) value += content[i];
            i++;
        }
        return { value: value.trim(), end: i };
    }

    // Plain value (until comma or closing brace)
    let value = '';
    while (i < content.length && content[i] !== ',' && content[i] !== '}') {
        value += content[i];
        i++;
    }
    return { value: value.trim(), end: i };
}

/**
 * Parse a single BibTeX entry
 */
function parseEntry(content: string): BibTeXEntry | null {
    // Match @type{key, ... }
    const typeMatch = content.match(/^@(\w+)\s*\{(\S+)\s*,/);
    if (!typeMatch) return null;

    const type = typeMatch[1].toLowerCase();
    const key = typeMatch[2];

    if (!ENTRY_TYPES.has(type)) return null;

    const fields: Record<string, string> = {};
    let i = typeMatch[0].length;

    while (i < content.length) {
        // Skip whitespace and commas
        while (i < content.length && (content[i] === ',' || content[i] === ' ' || content[i] === '\n' || content[i] === '\r' || content[i] === '\t')) {
            i++;
        }

        if (i >= content.length || content[i] === '}') break;

        // Read field name
        let fieldName = '';
        while (i < content.length && content[i] !== '=' && content[i] !== ',' && content[i] !== '}') {
            fieldName += content[i];
            i++;
        }

        fieldName = fieldName.trim().toLowerCase();
        if (!fieldName || fieldName === '}') break;

        if (content[i] === '=') {
            i++; // skip '='
            const { value, end } = extractFieldValue(content, i);
            fields[fieldName] = value;
            i = end;
        } else {
            // Skip to next field
            while (i < content.length && content[i] !== ',' && content[i] !== '}') i++;
        }
    }

    return { type, key, fields };
}

/**
 * Parse BibTeX content into structured paper objects
 */
export function parseBibTeX(content: string): ParsedPaper[] {
    const papers: ParsedPaper[] = [];
    // Match each entry: @type{key, ... }
    const entryRegex = /@(\w+)\s*\{[^@]*/g;
    let match;

    while ((match = entryRegex.exec(content)) !== null) {
        const entry = parseEntry(match[0]);
        if (!entry) continue;

        const rawTitle = entry.fields['title'] || '';
        const title = decodeSpecialChars(rawTitle);

        if (!title) continue; // Skip entries without titles

        const authors = entry.fields['author'] ? parseAuthors(entry.fields['author']) : [];
        const yearStr = entry.fields['year'];
        const year = yearStr ? parseInt(yearStr, 10) : null;

        // Venue: prefer journal for articles, booktitle for inproceedings
        let venue: string | null = null;
        if (entry.type === 'article' && entry.fields['journal']) {
            venue = decodeSpecialChars(entry.fields['journal']);
        } else if (entry.fields['booktitle']) {
            venue = decodeSpecialChars(entry.fields['booktitle']);
        } else if (entry.fields['journal']) {
            venue = decodeSpecialChars(entry.fields['journal']);
        }

        papers.push({
            title,
            authors,
            year: year && !isNaN(year) ? year : null,
            abstract: entry.fields['abstract'] ? decodeSpecialChars(entry.fields['abstract']) : null,
            doi: entry.fields['doi'] || null,
            url: entry.fields['url'] || entry.fields['link'] || null,
            venue,
            type: entry.type,
            bibtexKey: entry.key,
            rawFields: entry.fields,
        });
    }

    return papers;
}

/**
 * Convert a parsed paper to the format expected by the papers table
 */
export function toPaperRecord(paper: ParsedPaper, userId: string) {
    // Generate a URL from DOI or use a placeholder
    const url = paper.url
        || (paper.doi ? `https://doi.org/${paper.doi}` : `bibtex://imported/${paper.bibtexKey}`);

    return {
        user_id: userId,
        url,
        title: paper.title,
        abstract: paper.abstract,
        authors: paper.authors,
        venue: paper.venue,
        year: paper.year,
        content: null,
        source: 'bibtex_import',
        metadata: {
            bibtexKey: paper.bibtexKey,
            bibtexType: paper.type,
            doi: paper.doi,
            ...paper.rawFields,
        },
    };
}
