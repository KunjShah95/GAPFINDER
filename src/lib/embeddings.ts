// Embeddings and Vector Search Service
// Provides semantic similarity search using embeddings
import { apiRequest } from '@/lib/api-client';

// ============================================================================
// TYPES
// ============================================================================

export interface EmbeddingVector {
    dimensions: number;
    values: number[];
}

export interface SemanticSearchResult {
    id: string;
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
}

export interface EmbeddingConfig {
    model: string;
    dimensions: number;
    maxTokens: number;
}

// ============================================================================
// EMBEDDING SERVICE
// ============================================================================

const DEFAULT_CONFIG: EmbeddingConfig = {
    model: 'text-embedding-004',
    dimensions: 768,
    maxTokens: 8000,
};

class EmbeddingService {
    private config: EmbeddingConfig;
    private cache: Map<string, { embedding: number[]; timestamp: number }> = new Map();
    private cacheTTL = 24 * 60 * 60 * 1000;

    constructor(config?: Partial<EmbeddingConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    async generateEmbedding(text: string): Promise<EmbeddingVector> {
        const cacheKey = this.hashText(text);
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return { dimensions: this.config.dimensions, values: cached.embedding };
        }

        try {
            const result = await apiRequest<{ values: number[]; dimensions: number }>('/ai/embeddings', {
                method: 'POST',
                body: { text: this.truncateText(text, 3000), model: this.config.model },
                timeout: 30_000,
            });
            const values = result.values || [];

            this.cache.set(cacheKey, { embedding: values, timestamp: Date.now() });

            return { dimensions: values.length || result.dimensions, values };
        } catch (error) {
            console.error('[Embeddings] Generation failed, using fallback:', error);
            return this.generateFallbackEmbedding(text);
        }
    }

    generateFallbackEmbedding(text: string): EmbeddingVector {
        const words = text.toLowerCase().split(/\s+/);
        const vector = new Array(this.config.dimensions).fill(0);
        
        for (let i = 0; i < words.length; i++) {
            const hash = this.simpleHash(words[i]);
            const dimension = hash % this.config.dimensions;
            vector[dimension] += 1 / (i + 1);
        }

        const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
        if (magnitude > 0) {
            for (let i = 0; i < vector.length; i++) {
                vector[i] /= magnitude;
            }
        }

        return { dimensions: this.config.dimensions, values: vector };
    }

    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength);
    }

    private hashText(text: string): string {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }

    private simpleHash(word: string): number {
        let hash = 0;
        for (let i = 0; i < word.length; i++) {
            hash = ((hash << 5) - hash) + word.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    clearCache(): void {
        this.cache.clear();
    }
}

// ============================================================================
// VECTOR STORE
// ============================================================================

interface IndexedDocument {
    id: string;
    content: string;
    embedding: number[];
    metadata: Record<string, unknown>;
    createdAt: number;
}

class VectorStore {
    private documents: Map<string, IndexedDocument> = new Map();
    private service: EmbeddingService;

    constructor(embeddingService?: EmbeddingService) {
        this.service = embeddingService || new EmbeddingService();
    }

    async indexDocument(
        id: string,
        content: string,
        metadata: Record<string, unknown> = {}
    ): Promise<void> {
        const embedding = await this.service.generateEmbedding(content);
        
        this.documents.set(id, {
            id,
            content,
            embedding: embedding.values,
            metadata,
            createdAt: Date.now(),
        });
    }

    async indexBatch(
        documents: { id: string; content: string; metadata?: Record<string, unknown> }[]
    ): Promise<void> {
        for (const doc of documents) {
            await this.indexDocument(doc.id, doc.content, doc.metadata);
        }
    }

    async search(
        query: string,
        options: { topK?: number; threshold?: number } = {}
    ): Promise<SemanticSearchResult[]> {
        const queryEmbedding = await this.service.generateEmbedding(query);
        const topK = options.topK || 10;
        const threshold = options.threshold || 0.0;

        const results: { id: string; content: string; score: number; metadata?: Record<string, unknown> }[] = [];

        for (const [, doc] of this.documents) {
            const score = this.cosineSimilarity(queryEmbedding.values, doc.embedding);
            
            if (score >= threshold) {
                results.push({
                    id: doc.id,
                    content: doc.content,
                    score,
                    metadata: doc.metadata,
                });
            }
        }

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    async findSimilar(
        documentId: string,
        options: { topK?: number; threshold?: number } = {}
    ): Promise<SemanticSearchResult[]> {
        const target = this.documents.get(documentId);
        if (!target) return [];

        return this.search(target.content, options);
    }

    deleteDocument(id: string): boolean {
        return this.documents.delete(id);
    }

    clear(): void {
        this.documents.clear();
    }

    getSize(): number {
        return this.documents.size;
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        return denominator > 0 ? dotProduct / denominator : 0;
    }
}

// ============================================================================
// GAP SIMILARITY SEARCH
// ============================================================================

export interface GapSimilarityResult {
    sourceGap: {
        id: string;
        problem: string;
        type: string;
    };
    similarGaps: {
        id: string;
        problem: string;
        type: string;
        similarity: number;
        paper: string;
    }[];
}

class GapSimilarityEngine {
    private vectorStore: VectorStore;
    private gapIndex: Map<string, { problem: string; type: string; paper: string }> = new Map();

    constructor(vectorStore?: VectorStore) {
        this.vectorStore = vectorStore || new VectorStore();
    }

    async indexGap(
        gapId: string,
        problem: string,
        type: string,
        paper: string
    ): Promise<void> {
        this.gapIndex.set(gapId, { problem, type, paper });
        await this.vectorStore.indexDocument(gapId, `${type}: ${problem}`, { gapId, type, paper });
    }

    async findSimilarGaps(
        gapId: string,
        options: { topK?: number; threshold?: number } = {}
    ): Promise<GapSimilarityResult | null> {
        const sourceGap = this.gapIndex.get(gapId);
        if (!sourceGap) return null;

        const results = await this.vectorStore.findSimilar(gapId, options);
        const similarGaps = results
            .filter(r => r.id !== gapId)
            .map(r => {
                const gapInfo = this.gapIndex.get(r.id);
                return {
                    id: r.id,
                    problem: gapInfo?.problem || '',
                    type: gapInfo?.type || '',
                    similarity: r.score,
                    paper: gapInfo?.paper || '',
                };
            });

        return {
            sourceGap: { id: gapId, ...sourceGap },
            similarGaps: similarGaps.slice(0, options.topK || 10),
        };
    }

    async clusterGapsBySimilarity(
        gapIds: string[],
        threshold = 0.7
    ): Promise<string[][]> {
        const clusters: string[][] = [];
        const assigned = new Set<string>();

        for (const gapId of gapIds) {
            if (assigned.has(gapId)) continue;

            const cluster: string[] = [gapId];
            assigned.add(gapId);

            for (const otherId of gapIds) {
                if (assigned.has(otherId)) continue;

                const result = await this.findSimilarGaps(gapId, { topK: 1, threshold });
                if (result) {
                    const similar = result.similarGaps.find(s => s.id === otherId);
                    if (similar && similar.similarity >= threshold) {
                        cluster.push(otherId);
                        assigned.add(otherId);
                    }
                }
            }

            clusters.push(cluster);
        }

        return clusters;
    }

    getIndexedGaps(): string[] {
        return Array.from(this.gapIndex.keys());
    }
}

// ============================================================================
// SINGLETONS
// ============================================================================

export const embeddingService = new EmbeddingService();
export const vectorStore = new VectorStore(embeddingService);
export const gapSimilarityEngine = new GapSimilarityEngine(vectorStore);

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export async function getTextEmbedding(text: string): Promise<EmbeddingVector> {
    return embeddingService.generateEmbedding(text);
}

export async function semanticSearch(
    query: string,
    options?: { topK?: number; threshold?: number }
): Promise<SemanticSearchResult[]> {
    return vectorStore.search(query, options);
}

export async function indexPaperForSearch(
    paperId: string,
    title: string,
    abstract: string,
    content: string
): Promise<void> {
    const fullText = `${title} ${abstract} ${content}`;
    await vectorStore.indexDocument(paperId, fullText, { paperId, title, type: 'paper' });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const embeddings = {
    EmbeddingService,
    VectorStore,
    GapSimilarityEngine,
    embeddingService,
    vectorStore,
    gapSimilarityEngine,
    getTextEmbedding,
    semanticSearch,
    indexPaperForSearch,
};

export default embeddings;
