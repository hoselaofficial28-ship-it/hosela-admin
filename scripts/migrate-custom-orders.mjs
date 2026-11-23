import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd());
if (!process.argv.includes('--apply')) {
  console.log('Belum ada perubahan. Setelah disetujui: node scripts/migrate-custom-orders.mjs --apply');
  process.exit(0);
}
const sql = fs.readFileSync(path.join(process.cwd(), 'migrations/20261121-custom-orders.sql'), 'utf8');
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.STORAGE_URL;
if (url) {
  const { Client } = require('pg');
  const client = new Client({ connectionString: url, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql.replaceAll('__PREFIX__', 'hn_'));
    await client.query('COMMIT');
    console.log('Migrasi pesanan custom PostgreSQL berhasil.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
} else {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(process.cwd(), 'hosela.db'), { fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    db.transaction(() => db.exec(sql.replaceAll('__PREFIX__', '')))();
    console.log('Migrasi pesanan custom SQLite berhasil.');
  } finally { db.close(); }
}
