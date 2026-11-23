// Regression tests with in-memory databases only; never opens hosela.db.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const localRequire = createRequire(import.meta.url);
const Database = localRequire('better-sqlite3');
const bcrypt = localRequire('bcryptjs');
function load(file, imports) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => Object.hasOwn(imports, name) ? imports[name] : localRequire(name), compiled, compiled.exports);
  return compiled.exports;
}
const permissions = load('src/lib/permissions.ts', {});
const hash = bcrypt.hashSync('fixture-password-only', 4);
function legacyDatabase() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT, name TEXT, email TEXT);
    CREATE TABLE perfect_week (id INTEGER PRIMARY KEY, user_id INTEGER, day_of_week INTEGER, start_time TEXT, end_time TEXT, label TEXT, block_type TEXT, created_at TEXT, updated_at TEXT);`);
  db.prepare("INSERT INTO users VALUES (1,'fixture',?,'owner','Fixture',NULL)").run(hash);
  return db;
}
const db = legacyDatabase();
const api = load('src/lib/db.ts', { 'better-sqlite3': function () { return db; }, './permissions': permissions });
try {
  assert.equal(api.getDb(), db);
  assert.ok(db.prepare('PRAGMA table_info(perfect_week)').all().some(c => c.name === 'week_start'));
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='idx_perfect_week_user_week'").get());
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id=1').get().password_hash, hash);
  assert.equal(api.getDb(), db);
  console.log('PASS: database lama dibuka, kolom tersedia sebelum indeks, password dipertahankan, koneksi siap dipakai ulang.');
} finally { db.close(); }
let attempts = 0;
let failedClosed = false;
const retryDb = legacyDatabase();
const retry = load('src/lib/db.ts', { 'better-sqlite3': function () {
  attempts++;
  if (attempts === 1) return { pragma() {}, exec() { throw new Error('fixture failure'); }, close() { failedClosed = true; } };
  return retryDb;
}, './permissions': permissions });
try {
  assert.throws(() => retry.getDb(), /fixture failure/);
  assert.equal(failedClosed, true);
  assert.equal(retry.getDb(), retryDb);
  assert.equal(attempts, 2);
  console.log('PASS: inisialisasi gagal menutup koneksi; percobaan berikutnya membuat koneksi yang sehat.');
} finally { retryDb.close(); }
