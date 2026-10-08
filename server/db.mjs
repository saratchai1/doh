import { promises as fs } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { hashPassword } from './security.mjs';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
});

export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const dir = path.resolve('db/migrations');
  const names = (await fs.readdir(dir)).filter((x) => x.endsWith('.sql')).sort();
  for (const name of names) {
    const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]);
    if (exists.rowCount) continue;
    const sql = await fs.readFile(path.join(dir, name), 'utf8');
    await withTx(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    });
    console.log(`migration applied: ${name}`);
  }
}

export async function bootstrapAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters');
  const found = await pool.query('SELECT id FROM users WHERE lower(email)=lower($1)', [email]);
  if (found.rowCount) return;
  await pool.query(
    `INSERT INTO users(email,display_name,role,password_hash)
     VALUES($1,$2,'ADMIN',$3)`,
    [email, process.env.BOOTSTRAP_ADMIN_NAME || 'DOH Administrator', hashPassword(password)],
  );
  console.log(`bootstrap admin created: ${email}`);
}

export async function pruneSessions() {
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
}
