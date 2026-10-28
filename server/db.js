// Postgres access + tiny migration runner (server/migrations/*.sql, applied once, in file order).
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function connect(url) {
  if (!url) throw new Error('DATABASE_URL is required (a Postgres connection string, e.g. from Neon). For local tests run tools/dev-postgres.sh');
  try { new URL(url); } catch { throw new Error('DATABASE_URL is not a valid connection string'); }
  return new pg.Pool({ connectionString: url, max: 6, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
}

export async function migrate(pool) {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const dir = path.join(here, 'migrations'), files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if ((await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [f])).rowCount) continue;
    const c = await pool.connect();
    try { await c.query('BEGIN'); await c.query(fs.readFileSync(path.join(dir, f), 'utf8')); await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]); await c.query('COMMIT'); console.log('migration applied:', f); }
    catch (e) { await c.query('ROLLBACK'); throw new Error(`migration ${f} failed: ${e.message}`); } finally { c.release(); }
  }
}

export async function tx(pool, fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
