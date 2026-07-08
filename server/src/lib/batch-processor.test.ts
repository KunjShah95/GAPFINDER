import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    buildBulkGapAnalysisItems,
    buildNightlyIngestionItems,
    buildKnowledgeGraphItems,
    buildClassificationItems,
} from './batch-processor.js';
import { BatchItem } from '../queues/batch-queue.js';

// ============================================================================
// BATCH PROCESSOR TESTS
// ============================================================================

describe('BatchProcessor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('buildBulkGapAnalysisItems', () => {
        it('should build correctly shaped BatchItems', () => {
            const raw = [
                { id: 'test-1', content: 'Paper about transformers', title: 'Transformer Paper', language: 'en' },
            ];

            const items = buildBulkGapAnalysisItems(raw);

            expect(items.length).toBe(1);
            expect(items[0].id).toBe('test-1');
            expect(items[0].type).toBe('bulk-gap-analysis');
            expect(items[0].payload.paperContent).toBe('Paper about transformers');
            expect(items[0].payload.paperTitle).toBe('Transformer Paper');
            expect(items[0].payload.language).toBe('en');
            expect(typeof items[0].payload.prompt).toBe('string');
        });

        it('should default language to en', () => {
            const items = buildBulkGapAnalysisItems([
                { id: 'x', content: 'text', title: 'Title' },
            ]);
            expect(items[0].payload.language).toBe('en');
        });
    });

    describe('buildNightlyIngestionItems', () => {
        it('should build correctly shaped BatchItems', () => {
            const items = buildNightlyIngestionItems([
                { id: 'ingest-1', content: 'New paper content', source: 'arxiv' },
            ]);

            expect(items.length).toBe(1);
            expect(items[0].type).toBe('nightly-ingestion');
            expect(items[0].payload.paperContent).toBe('New paper content');
            expect(items[0].payload.source).toBe('arxiv');
        });
    });

    describe('buildKnowledgeGraphItems', () => {
        it('should build correctly shaped BatchItems', () => {
            const items = buildKnowledgeGraphItems([
                { id: 'kg-1', paperId: 'p1', content: 'Paper for KG', existingEdges: [] },
            ]);

            expect(items.length).toBe(1);
            expect(items[0].type).toBe('knowledge-graph-update');
            expect(items[0].payload.paperId).toBe('p1');
            expect(items[0].payload.existingEdges).toEqual([]);
        });
    });

    describe('buildClassificationItems', () => {
        it('should build correctly shaped BatchItems', () => {
            const items = buildClassificationItems([
                { id: 'cls-1', title: 'AI Paper', abstract: 'About ML', content: 'Full text' },
            ]);

            expect(items.length).toBe(1);
            expect(items[0].type).toBe('classification');
            expect(items[0].payload.paperTitle).toBe('AI Paper');
            expect(items[0].payload.paperAbstract).toBe('About ML');
            expect(items[0].payload.paperContent).toBe('Full text');
        });
    });

    describe('BatchItem structure', () => {
        it('should have required fields', () => {
            const item: BatchItem = {
                id: 'test-id',
                type: 'bulk-gap-analysis',
                payload: { key: 'value' },
            };

            expect(item.id).toBe('test-id');
            expect(item.type).toBe('bulk-gap-analysis');
            expect(item.payload).toEqual({ key: 'value' });
        });

        it('should support all job types', () => {
            const jobTypes = [
                'bulk-gap-analysis',
                'nightly-ingestion',
                'knowledge-graph-update',
                'classification',
            ] as const;

            for (const jobType of jobTypes) {
                const item: BatchItem = {
                    id: `test-${jobType}`,
                    type: jobType,
                    payload: {},
                };
                expect(item.type).toBe(jobType);
            }
        });
    });
});
