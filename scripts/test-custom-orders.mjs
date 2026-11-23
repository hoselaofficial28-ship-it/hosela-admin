// Isolated in-memory tests. Does not open hosela.db or load application env files.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const localRequire = createRequire(import.meta.url);
const Database = localRequire('better-sqlite3');
const db = new Database(':memory:');
db.pragma('foreign_keys = ON');
db.exec('CREATE TABLE stores (id INTEGER PRIMARY KEY, short_name TEXT); INSERT INTO stores VALUES (1, \'Toko Uji\');');
const migration = fs.readFileSync('migrations/20261121-custom-orders.sql', 'utf8').replaceAll('__PREFIX__', '');
db.exec(migration);
db.exec(migration); // Migration is idempotent.
function load(file, imports) {
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const compiled = { exports: {} };
  const mockRequire = name => Object.hasOwn(imports, name) ? imports[name] : localRequire(name);
  new Function('require', 'module', 'exports', output)(mockRequire, compiled, compiled.exports);
  return compiled.exports;
}
const types = load('src/lib/custom-order-types.ts', {});
const repo = load('src/lib/custom-orders.ts', { './db': { getDb: () => db }, './pg': { hasPostgres: () => false }, './custom-order-types': types });
const { NextRequest } = localRequire('next/server');
let session = null;
const auth = { getSession: async () => session, canAccessFeature: user => user.role === 'owner' || user.permissions?.includes('input') };
const api = load('src/app/api/custom-orders/route.ts', { '@/lib/auth': auth, '@/lib/custom-orders': repo });
const owner = { id: 1, name: 'Owner Uji', role: 'owner' };
const admin = { id: 2, name: 'Admin Uji', role: 'admin' };
const payload = { store_id: 1, order_ref: 'TEST-ONLY', ship_date: '2026-11-22', notes: 'Pita merah, nama BUNDA', image: '' };
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${checks}: ${name}`); }
try {
  await check('Tanggal Indonesia berganti pada 00:00 WIB', () => {
    assert.equal(types.customOrderDay(new Date('2026-11-21T16:59:59Z')), '2026-11-21');
    assert.equal(types.customOrderDay(new Date('2026-11-21T17:00:00Z')), '2026-11-22');
  });
  await check('Tolak tanggal palsu, foto SVG dan data kosong', () => {
    assert.throws(() => types.validateCustomOrder({ ...payload, ship_date: '2026-02-30' }));
    assert.throws(() => types.validateCustomOrder({ ...payload, image: 'data:image/svg+xml;base64,AAAA' }));
    assert.throws(() => types.validateCustomOrder({ ...payload, notes: '' }));
  });
  const id = await repo.mutateCustomOrder(owner, { ...payload, action: 'create' });
  await check('Pesanan baru menahan input semua admin', async () => {
    assert.equal((await repo.listCustomOrders(admin.id))[0].needs_read, 1);
    assert.equal((await repo.listCustomOrders(owner.id))[0].needs_read, 1);
  });
  await check('Tidak boleh menyelesaikan sebelum membaca', async () => {
    await assert.rejects(repo.mutateCustomOrder(admin, { id, revision: 1, action: 'complete', confirmed: true }), /Baca/);
  });
  await repo.mutateCustomOrder(admin, { id, revision: 1, action: 'read' });
  await check('Membaca tercatat per orang, pesanan tetap aktif', async () => {
    const order = (await repo.listCustomOrders(admin.id))[0];
    assert.equal(order.needs_read, 0); assert.equal(order.status, 'open');
    assert.equal((await repo.listCustomOrders(owner.id))[0].needs_read, 1);
    assert.equal((await repo.customOrderHistory(id)).find(e => e.action === 'read').actor_name, admin.name);
  });
  await check('Berganti hari harus membaca ulang tanpa menghapus pesanan', async () => {
    db.prepare("UPDATE custom_order_events SET day='2000-01-01' WHERE action='read'").run();
    assert.equal((await repo.listCustomOrders(admin.id))[0].needs_read, 1);
  });
  await repo.mutateCustomOrder(admin, { id, revision: 1, action: 'read' });
  await check('Kendala membutuhkan alasan dan tetap aktif', async () => {
    await assert.rejects(repo.mutateCustomOrder(admin, { id, revision: 1, action: 'issue' }), /alasan/);
    await repo.mutateCustomOrder(admin, { id, revision: 1, action: 'issue', note: 'Menunggu pita' });
    assert.equal((await repo.listCustomOrders(admin.id))[0].status, 'issue');
  });
  await check('Konfirmasi wajib dicentang', async () => {
    await assert.rejects(repo.mutateCustomOrder(admin, { id, revision: 1, action: 'complete' }), /Centang/);
  });
  await check('Dua konfirmasi bersamaan hanya menghasilkan satu penyelesaian', async () => {
    const result = await Promise.allSettled([1, 2].map(() => repo.mutateCustomOrder(admin, { id, revision: 1, action: 'complete', confirmed: true, note: 'Sudah sesuai' })));
    assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await repo.customOrderHistory(id)).filter(e => e.action === 'completed').length, 1);
    assert.equal((await repo.listCustomOrders(admin.id))[0].status, 'done');
  });
  await check('Perubahan membuka ulang dan mempertahankan bukti konfirmasi lama', async () => {
    await repo.mutateCustomOrder(owner, { ...payload, id, revision: 1, action: 'update', notes: 'Ganti pita biru' });
    const order = (await repo.listCustomOrders(admin.id))[0];
    assert.equal(order.status, 'open'); assert.equal(order.revision, 2); assert.equal(order.needs_read, 1);
    const completion = (await repo.customOrderHistory(id)).find(e => e.action === 'completed');
    assert.equal(JSON.parse(completion.snapshot).notes, payload.notes);
  });
  await check('Konfirmasi versi lama ditolak', async () => {
    await assert.rejects(repo.mutateCustomOrder(admin, { id, revision: 1, action: 'read' }), /CONFLICT/);
  });
  await check('Pesanan lewat tanggal tetap menjadi pengingat', async () => {
    await repo.mutateCustomOrder(owner, { ...payload, action: 'create', ship_date: '2020-01-01' });
    assert.equal((await repo.listCustomOrders(admin.id)).filter(o => o.status !== 'done').length, 2);
  });
  await check('API menolak pengguna tanpa login / izin input', async () => {
    const req = new NextRequest('http://test/api/custom-orders');
    assert.equal((await api.GET(req)).status, 401);
    session = { ...admin, permissions: [] };
    assert.equal((await api.GET(req)).status, 403);
  });
  await check('Admin dapat membaca, tetapi tidak mengubah permintaan owner', async () => {
    session = { ...admin, permissions: ['input'] };
    assert.equal((await api.GET(new NextRequest('http://test/api/custom-orders'))).status, 200);
    const req = new NextRequest('http://test/api/custom-orders', { method: 'POST', body: JSON.stringify({ ...payload, action: 'create' }) });
    assert.equal((await api.POST(req)).status, 403);
  });
  await check('API menolak JSON rusak dan permintaan berlebihan', async () => {
    const bad = new NextRequest('http://test/api/custom-orders', { method: 'POST', body: '{' });
    assert.equal((await api.POST(bad)).status, 400);
    const large = new NextRequest('http://test/api/custom-orders', { method: 'POST', headers: { 'content-length': '2000000' }, body: '{}' });
    assert.equal((await api.POST(large)).status, 413);
  });
  await check('API simpan resi menolak permintaan custom yang belum dibaca', async () => {
    const shipments = load('src/app/api/shipments/route.ts', {
      '@/lib/auth': auth, '@/lib/custom-orders': repo,
      '@/lib/db': { getDb: () => { throw new Error('TIDAK BOLEH MENULIS RESI'); } },
      '@/lib/pg': { hasPostgres: () => false }, '@/lib/seed-history': {},
    });
    const response = await shipments.POST(new NextRequest('http://test/api/shipments', { method: 'POST', body: JSON.stringify({ date: '2026-11-22', shipments: [] }) }));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /belum Anda baca/);
  });
  await check('Peluncuran sebelum migrasi tidak menghalangi resi; gangguan koneksi tetap ditolak', async () => {
    for (const message of ['no such table: custom_orders', 'connection timed out']) {
      const unavailable = { ...repo, listCustomOrders: async () => { throw new Error(message); } };
      const customApi = load('src/app/api/custom-orders/route.ts', { '@/lib/auth': auth, '@/lib/custom-orders': unavailable });
      const shipmentApi = load('src/app/api/shipments/route.ts', {
        '@/lib/auth': auth, '@/lib/custom-orders': unavailable,
        '@/lib/db': { getDb: () => { throw new Error('TIDAK BOLEH MENULIS DATA'); } },
        '@/lib/pg': { hasPostgres: () => false }, '@/lib/seed-history': {},
      });
      const listing = await customApi.GET(new NextRequest('http://test/api/custom-orders'));
      const save = await shipmentApi.POST(new NextRequest('http://test/api/shipments', { method: 'POST', body: '{}' }));
      if (message.startsWith('no such table')) {
        assert.equal(listing.status, 200);
        assert.equal((await listing.json()).setup_required, true);
        // Reaching ordinary payload validation proves the schema absence did not block input.
        assert.equal(save.status, 400);
        assert.equal((await save.json()).error, 'Data tidak valid');
      } else {
        assert.equal(save.status, 503);
        assert.notEqual(listing.status, 200);
      }
    }
  });
  console.log(`${checks} pengujian lolos; database operasional tidak dibuka.`);
} finally { db.close(); }
