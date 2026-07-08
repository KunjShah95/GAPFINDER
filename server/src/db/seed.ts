// ============================================================================
// Database Seed Script
// Creates demo data for development
// ============================================================================

import bcrypt from 'bcryptjs';
import { query, closePool, transaction } from './client.js';

async function seed() {
    console.log('[Seed] Starting database seeding...');

    try {
        // Create demo user
        const passwordHash = await bcrypt.hash('demo1234', 12);

        await transaction(async (client) => {
            // Check if demo user exists
            const existing = await client.query('SELECT id FROM users WHERE email = $1', ['demo@gapminer.ai']);
            if (existing.rows.length > 0) {
                console.log('[Seed] Demo user already exists, skipping...');
                return;
            }

            // Create demo user
            const userResult = await client.query(
                `INSERT INTO users (email, password_hash, name, role, is_verified)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id`,
                ['demo@gapminer.ai', passwordHash, 'Demo Researcher', 'user', true]
            );
            const userId = userResult.rows[0].id;

            // Create subscription
            await client.query(
                `INSERT INTO subscriptions (user_id, tier, status)
                 VALUES ($1, 'pro', 'active')`,
                [userId]
            );

            // Create usage record
            await client.query(
                `INSERT INTO usage_records (user_id, period_start, period_end)
                 VALUES ($1, date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month')`,
                [userId]
            );

            // Create XP record
            await client.query(
                `INSERT INTO user_xp (user_id, total_xp, level, current_streak, papers_analyzed, gaps_found)
                 VALUES ($1, 450, 3, 5, 12, 47)`,
                [userId]
            );

            // Create demo papers
            const paper1 = await client.query(
                `INSERT INTO papers (user_id, url, title, abstract, venue, year, authors)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id`,
                [
                    userId,
                    'https://arxiv.org/abs/2301.01234',
                    'Attention Is All You Need: Revisited',
                    'We revisit the transformer architecture and identify key limitations...',
                    'arXiv',
                    2024,
                    ['Alice Smith', 'Bob Johnson']
                ]
            );

            const paper2 = await client.query(
                `INSERT INTO papers (user_id, url, title, abstract, venue, year, authors)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id`,
                [
                    userId,
                    'https://arxiv.org/abs/2312.56789',
                    'Scaling Laws for Language Model Fine-tuning',
                    'We study the optimal compute allocation for fine-tuning large language models...',
                    'NeurIPS',
                    2024,
                    ['Carol Zhang', 'Dave Williams']
                ]
            );

            // Create demo gaps
            await client.query(
                `INSERT INTO gaps (paper_id, user_id, problem, type, confidence, impact_score, difficulty, assumptions, failures)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    paper1.rows[0].id, userId,
                    'The paper assumes uniform attention distribution across all input tokens, which may not hold for hierarchical or structured text.',
                    'theory', 0.85, 'high', 'medium',
                    ['Uniform token importance', 'Static attention patterns'],
                    ['Sparse attention did not scale beyond 4K context']
                ]
            );

            await client.query(
                `INSERT INTO gaps (paper_id, user_id, problem, type, confidence, impact_score, difficulty, assumptions, failures)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    paper1.rows[0].id, userId,
                    'No evaluation on code generation or mathematical reasoning tasks. Results may not generalize beyond NLP benchmarks.',
                    'evaluation', 0.72, 'medium', 'low',
                    ['NLP benchmarks are representative'],
                    []
                ]
            );

            await client.query(
                `INSERT INTO gaps (paper_id, user_id, problem, type, confidence, impact_score, difficulty, assumptions, failures)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    paper2.rows[0].id, userId,
                    'Scaling laws derived from compute-optimal training may not apply to domain-specific fine-tuning where data quality varies significantly.',
                    'methodology', 0.68, 'high', 'high',
                    ['Homogeneous data quality', 'Linear compute scaling'],
                    ['Mixture-of-experts approach showed diminishing returns on small datasets']
                ]
            );

            // Create a demo collection
            await client.query(
                `INSERT INTO collections (user_id, name, description, color, starred)
                 VALUES ($1, $2, $3, $4, $5)`,
                [userId, 'Transformer Research', 'Key papers on transformer architectures and scaling', '#f97316', true]
            );

            console.log('[Seed] ✅ Demo data created successfully');
            console.log('[Seed] Demo login: demo@gapminer.ai / demo1234');
        });
    } catch (error) {
        console.error('[Seed] ❌ Seeding failed:', error);
        process.exit(1);
    } finally {
        await closePool();
    }
}

seed();
