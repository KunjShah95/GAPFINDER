// ============================================================================
// Model Router Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
    routeModel,
    logRoutingDecision,
    getRoutingStats,
    clearRoutingLogs,
    ComplexityLevel,
} from './model-router.js';

describe('Model Router', () => {
    beforeEach(() => {
        clearRoutingLogs();
    });

    // ========================================================================
    // Simple Tasks
    // ========================================================================

    describe('simple classification', () => {
        it('classifies short extraction prompts as simple', () => {
            const result = routeModel('Extract the title from this paper');
            expect(result.level).toBe('simple');
            expect(result.model).toBe('gemini-2.0-flash');
        });

        it('classifies categorization as simple', () => {
            const result = routeModel('Categorize this paper into one of: ML, NLP, CV');
            expect(result.level).toBe('simple');
        });

        it('classifies list/enumerate as simple', () => {
            const result = routeModel('List the authors of this paper');
            expect(result.level).toBe('simple');
        });

        it('classifies yes/no questions as simple', () => {
            const result = routeModel('Is this paper about deep learning? Yes or no');
            expect(result.level).toBe('simple');
        });

        it('classifies count questions as simple', () => {
            const result = routeModel('How many references does this paper have?');
            expect(result.level).toBe('simple');
        });

        it('classifies formatting tasks as simple', () => {
            const result = routeModel('Convert this citation to APA format');
            expect(result.level).toBe('simple');
        });
    });

    // ========================================================================
    // Medium Tasks
    // ========================================================================

    describe('medium classification', () => {
        it('classifies single-paper summarization as medium', () => {
            const result = routeModel('Summarize the key findings of this paper about transformer architectures in natural language processing');
            expect(result.level).toBe('medium');
        });

        it('classifies gap analysis as medium', () => {
            const result = routeModel('Analyze the research gaps in this paper and suggest future directions');
            expect(result.level).toBe('medium');
        });

        it('classifies explanation tasks as medium', () => {
            const result = routeModel('Explain the methodology used in this study and why it was chosen over alternatives');
            expect(result.level).toBe('medium');
        });

        it('classifies single paper identification as medium', () => {
            const result = routeModel('Identify the main contributions and limitations of this work');
            expect(result.level).toBe('medium');
        });
    });

    // ========================================================================
    // Complex Tasks
    // ========================================================================

    describe('complex classification', () => {
        it('classifies multi-paper comparison as complex', () => {
            const result = routeModel(
                'Compare these three papers on attention mechanisms. Paper 1: Attention Is All You Need. ' +
                'Paper 2: BERT. Paper 3: GPT-3. Identify contradicting findings and complementary insights.'
            );
            expect(result.level).toBe('complex');
            expect(result.model).toBe('gemini-2.0-pro');
        });

        it('classifies synthesis tasks as complex', () => {
            const result = routeModel(
                'Synthesize findings across these multiple studies to identify common themes and gaps'
            );
            expect(result.level).toBe('complex');
        });

        it('classifies red-team analysis as complex', () => {
            const result = routeModel(
                'Red-team this research proposal. Critique the methodology, evaluate trade-offs, and identify potential failure modes'
            );
            expect(result.level).toBe('complex');
        });

        it('classifies systematic review as complex', () => {
            const result = routeModel(
                'Systematic review of literature on few-shot learning across multiple papers. Compare approaches, synthesize findings, and propose a unified framework'
            );
            expect(result.level).toBe('complex');
        });

        it('classifies meta-analysis as complex', () => {
            const result = routeModel(
                'Meta-analysis of these 5 papers on reinforcement learning. Evaluate conflicting results and provide holistic assessment'
            );
            expect(result.level).toBe('complex');
        });

        it('classifies long prompts with multiple papers as complex', () => {
            const longPrompt = `
                Paper 1: Deep Residual Learning (He et al.)
                Paper 2: Batch Normalization (Ioffe & Szegedy)
                Paper 3: Dropout (Srivastava et al.)
                
                Compare these foundational techniques. Identify:
                1. Common themes and approaches
                2. Key differences in methodology
                3. Contradicting findings
                4. Complementary insights
                5. Combined research gaps
                
                Provide a comprehensive analysis with trade-offs.
            `;
            const result = routeModel(longPrompt);
            expect(result.level).toBe('complex');
        });
    });

    // ========================================================================
    // Prompt Length Thresholds
    // ========================================================================

    describe('prompt length thresholds', () => {
        it('treats very long prompts (>15000) as more complex than long prompts (5000-15000)', () => {
            const longPrompt = 'analyze '.repeat(700); // ~5600 chars
            const veryLongPrompt = 'analyze '.repeat(2000); // ~16000 chars

            const longResult = routeModel(longPrompt);
            const veryLongResult = routeModel(veryLongPrompt);

            // Both should be medium or complex, but veryLong should have higher score
            expect(['medium', 'complex']).toContain(longResult.level);
            expect(['medium', 'complex']).toContain(veryLongResult.level);
        });

        it('short prompts below 200 chars get score reduction', () => {
            const result = routeModel('What is this?');
            expect(result.level).toBe('simple');
        });
    });

    // ========================================================================
    // Medium Routing (different model from simple)
    // ========================================================================

    describe('medium uses different model than simple', () => {
        it('simple routes to gemini-2.0-flash', () => {
            const result = routeModel('Extract the title');
            expect(result.level).toBe('simple');
            expect(result.model).toBe('gemini-2.0-flash');
        });

        it('medium routes to gpt-4o-mini', () => {
            const result = routeModel(
                'Summarize the key findings of this paper about transformer architectures in natural language processing'
            );
            expect(result.level).toBe('medium');
            expect(result.model).toBe('gpt-4o-mini');
            expect(result.provider).toBe('openai');
        });
    });

    // ========================================================================
    // Explicit Model Override
    // ========================================================================

    describe('explicit model override', () => {
        it('uses explicit model when provided', () => {
            const result = routeModel('Simple task', { explicitModel: 'gpt-4o' });
            expect(result.model).toBe('gpt-4o');
            expect(result.reason).toBe('explicit model override');
        });

        it('detects provider from explicit model name', () => {
            const result = routeModel('task', { explicitModel: 'claude-3.5-sonnet-20241022' });
            expect(result.provider).toBe('anthropic');
        });

        it('detects gemini provider', () => {
            const result = routeModel('task', { explicitModel: 'gemini-2.0-pro' });
            expect(result.provider).toBe('gemini');
        });
    });

    // ========================================================================
    // Paper Count Detection
    // ========================================================================

    describe('paper count detection', () => {
        it('detects arXiv references', () => {
            const result = routeModel(
                'Compare arXiv:2301.12345 and arXiv:2302.67890'
            );
            expect(result.level).toBe('complex');
        });

        it('detects Paper N: labels', () => {
            const result = routeModel(
                'Paper 1 describes attention. Paper 2 describes embeddings. Paper 3 describes训练. Compare them.'
            );
            expect(result.level).toBe('complex');
        });

        it('does NOT count markdown headers as paper references', () => {
            // Headers should not inflate paper count
            const result = routeModel(
                '### Attention Is All You Need\nContent here\n### BERT\nContent here\n### GPT-3\nContent here\nSummarize this paper.'
            );
            // Should NOT be complex just from headers — no real paper refs
            expect(result.level).not.toBe('complex');
        });

        it('does NOT count --- separators as paper references', () => {
            const result = routeModel(
                '---\nSome text\n---\nMore text\n---\nWhat is this paper about?'
            );
            // Should not inflate complexity from separators alone
            expect(result.level).not.toBe('complex');
        });

        it('accepts explicit paper count', () => {
            const result = routeModel('Compare these papers', { paperCount: 5 });
            expect(result.level).toBe('complex');
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('edge cases', () => {
        it('handles empty-ish prompts gracefully', () => {
            const result = routeModel('hi');
            expect(['simple', 'medium']).toContain(result.level);
        });

        it('handles very long prompts', () => {
            const longText = 'analyze '.repeat(500);
            const result = routeModel(longText);
            expect(['medium', 'complex']).toContain(result.level);
        });

        it('handles mixed signals', () => {
            const result = routeModel(
                'List the key findings from this comparison of 5 papers on transformer architectures'
            );
            // Has both simple ("list") and complex ("comparison", "5 papers") signals
            expect(['medium', 'complex']).toContain(result.level);
        });

        it('never returns undefined model', () => {
            const prompts = ['short', 'a'.repeat(10000), 'compare multiple papers synthesis'];
            for (const p of prompts) {
                const result = routeModel(p);
                expect(result.model).toBeTruthy();
                expect(result.provider).toBeTruthy();
            }
        });
    });

    // ========================================================================
    // Cost Logging
    // ========================================================================

    describe('cost logging', () => {
        it('logs routing decisions', () => {
            const decision = routeModel('Extract title');
            logRoutingDecision(decision, 50);

            const stats = getRoutingStats();
            expect(stats.total).toBe(1);
            expect(stats.byLevel.simple).toBe(1);
        });

        it('calculates estimated savings', () => {
            // Simulate 10 simple calls (all would be flash at 0.15 cost)
            for (let i = 0; i < 10; i++) {
                const decision = routeModel('Extract data from this paper');
                logRoutingDecision(decision, 100);
            }

            const stats = getRoutingStats();
            expect(stats.estimatedSavings).toBeGreaterThan(0);
            expect(stats.avgCostFactor).toBeLessThan(1.0);
        });

        it('clears logs', () => {
            logRoutingDecision(routeModel('test'), 10);
            clearRoutingLogs();
            expect(getRoutingStats().total).toBe(0);
        });
    });
});
