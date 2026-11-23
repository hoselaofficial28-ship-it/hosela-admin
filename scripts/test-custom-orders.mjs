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
  await check('Owner ditunda setelah menyimpan, masuk kembali / admin lain / versi baru tetap wajib membaca', () => {
    const order = { id: 'own', revision: 1, status: 'open', needs_read: true };
    const keys = ['own:1:2026-11-23'];
    assert.equal(types.customOrderNeedsPopup(order, keys, true, '2026-11-23'), false);
    assert.equal(types.customOrderNeedsPopup(order, keys, false, '2026-11-23'), true);
    assert.equal(types.customOrderNeedsPopup(order, [], true, '2026-11-23'), true);
    assert.equal(types.customOrderNeedsPopup({ ...order, revision: 2 }, keys, true, '2026-11-23'), true);
    assert.equal(types.customOrderNeedsPopup(order, keys, true, '2026-11-24'), true);
    assert.equal(types.customOrderNeedsPopup({ ...order, needs_read: false }, [], true, '2026-11-23'), false);
  });
  await check('Jumlah riwayat sebenarnya, halaman berikutnya, pencarian melampaui 100 terbaru', async () => {
    const insert = db.prepare(`INSERT INTO custom_orders (id,store_id,order_ref,ship_date,notes,image,revision,status,created_by,created_at,updated_at) VALUES (?,1,?,'2026-11-23',?,'',1,'done','Fixture',?,?)`);
    db.transaction(() => {
      for (let n = 0; n < 105; n++) {
        const stamp = new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString();
        insert.run(`fixture-${n}`, `ORDER-${n}`, n === 0 ? 'Unik_lama%!' : 'Contoh', stamp, stamp);
      }
    })();
    assert.equal(await repo.completedCustomOrderCount(), 105);
    const first = await repo.completedCustomOrders();
    assert.equal(first.orders.length, 20); assert.equal(first.total, 105); assert.equal(first.has_more, true);
    assert.equal(first.orders[0].order_ref, 'ORDER-104');
    const second = await repo.completedCustomOrders('', 20);
    assert.equal(second.orders.length, 20);
    assert.equal(second.orders.some(o => first.orders.some(p => p.id === o.id)), false);
    const last = await repo.completedCustomOrders('', 100);
    assert.equal(last.orders.length, 5); assert.equal(last.has_more, false);
    const search = await repo.completedCustomOrders('unik_lama%!');
    assert.equal(search.total, 1); assert.equal(search.orders[0].order_ref, 'ORDER-0');
    assert.equal((await repo.completedCustomOrders('Toko Uji')).total, 105);
    assert.equal((await repo.completedCustomOrders('tidak ditemukan')).total, 0);
    const response = await api.GET(new NextRequest('http://test/api/custom-orders?completed=true&offset=100'));
    assert.equal((await response.json()).orders.length, 5);
    assert.equal((await api.GET(new NextRequest('http://test/api/custom-orders?completed=true&offset=-1'))).status, 400);
    const summary = await (await api.GET(new NextRequest('http://test/api/custom-orders'))).json();
    assert.equal(summary.completed_total, 105);
    assert.equal(summary.orders.every(o => o.status !== 'done'), true);
  });
  await check('Foto dimuat terpisah, edit tetap mendapat foto asli, riwayat baca tidak menggandakan base64', async () => {
    const photo = 'data:image/jpeg;base64,' + 'A'.repeat(400000);
    const photoId = await repo.mutateCustomOrder(owner, { ...payload, image: photo, action: 'create' });
    await repo.mutateCustomOrder(admin, { id: photoId, revision: 1, action: 'read' });
    const order = (await repo.listCustomOrders(admin.id, true)).find(o => o.id === photoId);
    assert.match(order.image, /^\/api\/custom-orders\/photo/);
    assert.ok(JSON.stringify(order).length < 2000);
    const events = await repo.customOrderHistory(photoId);
    assert.ok(JSON.stringify(events).length < 5000);
    assert.equal(await repo.customOrderPhoto(photoId, 1), photo);
    assert.equal((await repo.customOrderForEdit(photoId)).image, photo);
    const read = db.prepare("SELECT snapshot FROM custom_order_events WHERE order_id=? AND action='read'").get(photoId);
    assert.ok(read.snapshot.length < 2000);
    await repo.mutateCustomOrder(owner, { ...payload, id: photoId, revision: 1, image: photo, action: 'update' });
    assert.equal(await repo.customOrderPhoto(photoId, 1), photo);
    console.log('Payload pesanan foto 400 KB menjadi ' + JSON.stringify(order).length + ' byte pada daftar.');
  });
  await check('Foto kedaluwarsa tepat 7 hari, salinan riwayat ikut dihapus, teks dan pelaksana tetap ada', async () => {
    const now = new Date();
    const photo = 'data:image/jpeg;base64,AAAA';
    const insert = db.prepare(`INSERT INTO custom_orders (id,store_id,order_ref,ship_date,notes,image,revision,status,created_by,created_at,updated_at) VALUES (?,1,?,'2026-11-23','Catatan dipertahankan',?,1,?,'Owner',?,?)`);
    for (const [key, age, status] of [['expired', 8, 'done'], ['boundary', 7, 'done'], ['recent', 6, 'done'], ['active-old', 8, 'open']]) {
      const stamp = new Date(now.getTime() - age * 86400000).toISOString();
      insert.run(key, key, photo, status, stamp, stamp);
      db.prepare('INSERT INTO custom_order_events (id,order_id,revision,action,actor_id,actor_name,day,created_at,note,snapshot) VALUES (?,?,1,?,2,?, ?,?,?,?)')
        .run('event-'+key, key, status === 'done' ? 'completed' : 'created', 'Admin Uji', '2026-11-23', stamp, 'Sesuai', JSON.stringify({image:photo,notes:'Catatan dipertahankan',revision:1}));
    }
    assert.equal(types.customPhotoExpired({ status:'done',updated_at:new Date(now.getTime()-7*86400000+1).toISOString() }, now.getTime()), false);
    assert.equal(await repo.customOrderPhoto('expired', 1), null);
    assert.equal((await repo.customOrderForEdit('expired')).image, '');
    assert.equal(JSON.parse((await repo.customOrderHistory('expired'))[0].snapshot).image, '');
    await repo.purgeExpiredCustomPhotos(now);
    await repo.purgeExpiredCustomPhotos(now); // Idempotent, does not alter completion time.
    for (const key of ['expired','boundary']) {
      const order = db.prepare('SELECT * FROM custom_orders WHERE id=?').get(key);
      assert.equal(order.image, ''); assert.equal(order.notes, 'Catatan dipertahankan'); assert.equal(order.status, 'done');
      const event = db.prepare('SELECT * FROM custom_order_events WHERE order_id=?').get(key);
      assert.equal(JSON.parse(event.snapshot).image, ''); assert.equal(event.actor_name, 'Admin Uji'); assert.equal(event.note, 'Sesuai');
    }
    for (const key of ['recent','active-old']) assert.equal(db.prepare('SELECT image FROM custom_orders WHERE id=?').get(key).image, photo);
  });
  await check('Endpoint foto dan pembersihan terjadwal memerlukan izin', async () => {
    const photoApi = load('src/app/api/custom-orders/photo/route.ts', { '@/lib/auth': auth, '@/lib/custom-orders': repo });
    session = null;
    assert.equal((await photoApi.GET(new NextRequest('http://test/api/custom-orders/photo?id=recent&revision=1'))).status, 401);
    session = { ...admin, permissions: ['input'] };
    assert.equal((await photoApi.GET(new NextRequest('http://test/api/custom-orders/photo?id=recent&revision=1'))).status, 200);
    assert.equal((await photoApi.GET(new NextRequest('http://test/api/custom-orders/photo?id=expired&revision=1'))).status, 404);
    const cron = load('src/app/api/cron/custom-order-photos/route.ts', { '@/lib/custom-orders': repo });
    const oldSecret = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      assert.equal((await cron.GET(new NextRequest('http://test/api/cron/custom-order-photos'))).status, 401);
      process.env.CRON_SECRET = 'fixture-only';
      assert.equal((await cron.GET(new NextRequest('http://test/api/cron/custom-order-photos', { headers: { authorization: 'Bearer fixture-only' } }))).status, 200);
    } finally { if(oldSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = oldSecret; }
  });
  await check('Riwayat selesai bisa dihapus manual oleh owner; pesanan aktif dan admin tetap ditolak', async () => {
    const doneId = await repo.mutateCustomOrder(owner, { ...payload, order_ref: 'HAPUS-1', action: 'create' });
    await repo.mutateCustomOrder(admin, { id: doneId, revision: 1, action: 'read' });
    await repo.mutateCustomOrder(admin, { id: doneId, revision: 1, action: 'complete', confirmed: true, note: 'Selesai' });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM custom_order_events WHERE order_id=?').get(doneId).n, 3);
    session = { ...admin, permissions: ['input'] };
    const forbidden = new NextRequest('http://test/api/custom-orders', { method: 'POST', body: JSON.stringify({ action: 'delete', id: doneId }) });
    assert.equal((await api.POST(forbidden)).status, 403);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM custom_orders WHERE id=?').get(doneId).n, 1);
    session = owner;
    const activeId = await repo.mutateCustomOrder(owner, { ...payload, order_ref: 'AKTIF-HAPUS', action: 'create' });
    await assert.rejects(repo.deleteCompletedCustomOrder(activeId), /selesai/);
    await assert.rejects(repo.deleteCompletedCustomOrder('tidak-ada'), /tidak ditemukan/);
    const rejected = new NextRequest('http://test/api/custom-orders', { method: 'POST', body: JSON.stringify({ action: 'delete', id: activeId }) });
    assert.equal((await api.POST(rejected)).status, 400);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM custom_orders WHERE id=?').get(activeId).n, 1);
    const accepted = new NextRequest('http://test/api/custom-orders', { method: 'POST', body: JSON.stringify({ action: 'delete', id: doneId }) });
    assert.equal((await api.POST(accepted)).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM custom_orders WHERE id=?').get(doneId).n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM custom_order_events WHERE order_id=?').get(doneId).n, 0);
  });
  console.log(`${checks} pengujian lolos; database operasional tidak dibuka.`);
} finally { db.close(); }
