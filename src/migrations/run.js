require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigrations() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const sqlDir = path.join(__dirname);
    const files = fs
      .readdirSync(sqlDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (rows.length > 0) {
        console.log(`[migrate] skip: ${file}`);
        continue;
      }

      console.log(`[migrate] applying: ${file}`);
      const sql = fs.readFileSync(path.join(sqlDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`[migrate] done: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] failed: ${file}`, err.message);
        process.exit(1);
      }
    }

    console.log('[migrate] all migrations complete');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error('[migrate] unexpected error:', err);
  process.exit(1);
});
