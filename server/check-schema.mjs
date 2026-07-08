import pg from 'pg';

const { Pool } = pg;

async function checkSchema() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gapminer'
    });

    try {
        const result = await pool.query(
            `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'gaps' ORDER BY ordinal_position`
        );
        console.log('\n=== GAPS TABLE SCHEMA ===');
        console.table(result.rows);
        
        // Also check if the table exists
        const tableCheck = await pool.query(
            `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'gaps')`
        );
        console.log('\nGaps table exists:', tableCheck.rows[0].exists);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkSchema();
