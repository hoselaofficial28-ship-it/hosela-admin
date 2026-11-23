import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import { hasPostgres, pgQuery, pgTransaction } from './pg';
import { customOrderDay, customPhotoExpired, CUSTOM_PHOTO_RETENTION_MS, validateCustomOrder, type CustomOrder, type CustomOrderEvent } from './custom-order-types';
import type { SessionUser } from './auth';

export function isCustomOrderSetupMissing(error: unknown) {
  return error instanceof Error && /(?:no such table|does not exist)/.test(error.message)
    && /(?:hn_)?custom_orders|(?:hn_)?custom_order_events/.test(error.message);
}

const table = (name: string) => `${hasPostgres() ? 'hn_' : ''}${name}`;
const photoUrl = (id: string, revision: number) => `/api/custom-orders/photo?id=${encodeURIComponent(id)}&revision=${revision}`;
// Never ship base64 photos in polling/list responses.
const orderColumns = `o.id,o.store_id,o.order_ref,o.ship_date,o.notes,o.revision,o.status,o.created_by,o.created_at,o.updated_at,
  CASE WHEN o.image != '' THEN '/api/custom-orders/photo?id=' || o.id || '&revision=' || o.revision ELSE '' END AS image`;
function publicOrder(order: CustomOrder) {
  return customPhotoExpired(order) ? { ...order, image: '', photo_expired: true } : order;
}
// Replace SQLite placeholders outside string literals only: the photo URL literally
// contains "?id=", which must not turn into "$1".
export function pgPlaceholders(sql: string) {
  let n = 0;
  let quoted = false;
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'") {
      if (quoted && sql[i + 1] === "'") { out += "''"; i++; continue; }
      quoted = !quoted;
      out += char;
      continue;
    }
    out += char === '?' && !quoted ? `$${++n}` : char;
  }
  return out;
}
const placeholders = pgPlaceholders;
async function rows<T>(sql: string, params: (string | number)[] = []): Promise<T[]> {
  if (hasPostgres()) return (await pgQuery(placeholders(sql), params)).rows as T[];
  return getDb().prepare(sql).all(...params) as T[];
}
// The conditional write and its audit event either both commit or both roll back.
async function batch(statements: { sql: string; params: (string | number)[]; check?: boolean; expect?: number }[]) {
  if (hasPostgres()) {
    await pgTransaction(async client => {
      for (const s of statements) {
        const result = await client.query(placeholders(s.sql), s.params);
        if (s.check && result.rowCount !== 1) throw new Error('CONFLICT');
        if (s.expect !== undefined && result.rowCount !== s.expect) throw new Error('CONFLICT');
      }
    });
  } else {
    const db = getDb();
    db.transaction(() => {
      for (const s of statements) {
        const result = db.prepare(s.sql).run(...s.params);
        if (s.check && result.changes !== 1) throw new Error('CONFLICT');
        if (s.expect !== undefined && result.changes !== s.expect) throw new Error('CONFLICT');
      }
    })();
  }
}
export async function listCustomOrders(userId: number, activeOnly = false) {
  const result = await rows<CustomOrder>(`SELECT ${orderColumns}, s.short_name AS store_name,
    CASE WHEN o.status != 'done' AND NOT EXISTS (
      SELECT 1 FROM ${table('custom_order_events')} e WHERE e.order_id=o.id AND e.revision=o.revision
      AND e.action='read' AND e.actor_id=? AND e.day=?
    ) THEN 1 ELSE 0 END AS needs_read
    FROM ${table('custom_orders')} o JOIN ${table('stores')} s ON s.id=o.store_id
    WHERE o.status != 'done' ${activeOnly ? '' : `OR o.id IN (SELECT id FROM ${table('custom_orders')} WHERE status='done' ORDER BY updated_at DESC LIMIT 100)`}
    ORDER BY o.ship_date ASC, o.created_at ASC`, [userId, customOrderDay()]);
  return result.map(publicOrder);
}
export async function customOrderHistory(id: string) {
  const result = await rows<CustomOrderEvent & { has_image: number }>(`SELECT id,order_id,revision,action,actor_id,actor_name,day,created_at,note,
    CASE WHEN COALESCE(${hasPostgres() ? "snapshot::jsonb->>'image'" : "json_extract(snapshot, '$.image')"},'') != '' THEN 1 ELSE 0 END AS has_image,
    ${hasPostgres() ? "(snapshot::jsonb - 'image')::text" : "json_remove(snapshot, '$.image')"} AS snapshot
    FROM ${table('custom_order_events')} WHERE order_id=? ORDER BY created_at DESC, id DESC`, [id]);
  const current = (await rows<CustomOrder>(`SELECT status,updated_at FROM ${table('custom_orders')} WHERE id=?`, [id]))[0];
  return result.map(event => ({ ...event, snapshot: JSON.stringify({ ...JSON.parse(event.snapshot),
    image: event.has_image && current && !customPhotoExpired(current) ? photoUrl(id, event.revision) : '',
    photo_expired: current ? customPhotoExpired(current) : false,
  }) }));
}
export async function completedCustomOrders(search = '', offset = 0) {
  const query = search.trim().slice(0, 160).toLowerCase();
  const pattern = `%${query.replace(/[!%_]/g, char => `!${char}`)}%`;
  const from = `FROM ${table('custom_orders')} o JOIN ${table('stores')} s ON s.id=o.store_id
    WHERE o.status='done' AND (LOWER(o.order_ref) LIKE ? ESCAPE '!' OR LOWER(o.notes) LIKE ? ESCAPE '!' OR LOWER(s.short_name) LIKE ? ESCAPE '!')`;
  const params = [pattern, pattern, pattern];
  const count = await rows<{ count: string | number }>(`SELECT COUNT(*) AS count ${from}`, params);
  const orders = await rows<CustomOrder>(`SELECT ${orderColumns}, s.short_name AS store_name ${from}
    ORDER BY o.updated_at DESC, o.id DESC LIMIT 20 OFFSET ?`, [...params, offset]);
  return { orders: orders.map(publicOrder), total: Number(count[0].count), has_more: offset + orders.length < Number(count[0].count) };
}
export async function customOrderForEdit(id: string) {
  const order = (await rows<CustomOrder>(`SELECT o.*, s.short_name AS store_name FROM ${table('custom_orders')} o JOIN ${table('stores')} s ON s.id=o.store_id WHERE o.id=?`, [id]))[0];
  return order ? publicOrder(order) : null;
}
export async function customOrderPhoto(id: string, revision: number) {
  const order = (await rows<CustomOrder>(`SELECT status,updated_at,revision,image FROM ${table('custom_orders')} WHERE id=?`, [id]))[0];
  if (!order || customPhotoExpired(order)) return null;
  if (order.revision === revision) return order.image || null;
  // Old versions remain available until the completed order reaches its retention date.
  const field = hasPostgres() ? "snapshot::jsonb->>'image'" : "json_extract(snapshot, '$.image')";
  const event = (await rows<{ image: string }>(`SELECT ${field} AS image FROM ${table('custom_order_events')}
    WHERE order_id=? AND revision=? AND action IN ('created','updated') ORDER BY created_at DESC LIMIT 1`, [id, revision]))[0];
  return event?.image || null;
}

// Clear both the primary photo and all historical copies in one transaction.
// Do not update updated_at: it is the completion time for completed orders.
export async function purgeExpiredCustomPhotos(now = new Date()) {
  const cutoff = new Date(now.getTime() - CUSTOM_PHOTO_RETENTION_MS).toISOString();
  await batch([
    { sql: `UPDATE ${table('custom_orders')} SET image='' WHERE status='done' AND updated_at<=? AND image!=''`, params: [cutoff] },
    { sql: `UPDATE ${table('custom_order_events')} SET snapshot=${hasPostgres() ? "jsonb_set(snapshot::jsonb, '{image}', '\"\"'::jsonb)::text" : "json_set(snapshot, '$.image', '')"}
      WHERE order_id IN (SELECT id FROM ${table('custom_orders')} WHERE status='done' AND updated_at<=?)
      AND COALESCE(${hasPostgres() ? "snapshot::jsonb->>'image'" : "json_extract(snapshot, '$.image')"},'')!=''`, params: [cutoff] },
  ]);
}
let lastPhotoSweep = 0;
let photoSweep: Promise<void> | null = null;
export async function maintainCustomPhotos() {
  if (photoSweep) return photoSweep;
  if (Date.now() - lastPhotoSweep < 60_000) return;
  photoSweep = purgeExpiredCustomPhotos().then(() => { lastPhotoSweep = Date.now(); }).finally(() => { photoSweep = null; });
  return photoSweep;
}
export async function completedCustomOrderCount() {
  const result = await rows<{ count: string | number }>(`SELECT COUNT(*) AS count FROM ${table('custom_orders')} WHERE status='done'`);
  return Number(result[0].count);
}
// Owner-only manual purge of finished records: the order rows, their photos and
// every activity snapshot go together, in one transaction. Active orders are never deletable.
export async function deleteCompletedCustomOrders(input: unknown) {
  const list = Array.isArray(input) ? input : [input];
  const ids = [...new Set(list.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64))];
  if (!ids.length) throw new Error('Pilih riwayat yang akan dihapus.');
  if (ids.length > 200) throw new Error('Maksimal 200 riwayat sekali hapus.');
  const marks = ids.map(() => '?').join(',');
  const found = await rows<{ id: string; status: string }>(`SELECT id,status FROM ${table('custom_orders')} WHERE id IN (${marks})`, ids);
  if (found.length !== ids.length) throw new Error('Pesanan tidak ditemukan.');
  if (found.some(order => order.status !== 'done')) throw new Error('Hanya riwayat pesanan selesai yang dapat dihapus.');
  await batch([
    { sql: `DELETE FROM ${table('custom_order_events')} WHERE order_id IN (${marks})`, params: ids },
    { sql: `DELETE FROM ${table('custom_orders')} WHERE id IN (${marks}) AND status='done'`, params: ids, expect: ids.length },
  ]);
  return ids.length;
}
export async function deleteCompletedCustomOrder(id: unknown) {
  return deleteCompletedCustomOrders([id]);
}
export async function mutateCustomOrder(user: SessionUser, body: Record<string, unknown>) {
  const action = body.action;
  const now = new Date().toISOString();
  let order: CustomOrder;
  const statements: { sql: string; params: (string | number)[]; check?: boolean }[] = [];
  if (action === 'create') {
    const data = validateCustomOrder(body);
    const stores = await rows<{ short_name: string }>(`SELECT short_name FROM ${table('stores')} WHERE id=?`, [data.store_id]);
    if (!stores.length) throw new Error('Toko tidak ditemukan.');
    order = { ...data, id: randomUUID(), revision: 1, status: 'open', created_by: user.name, created_at: now, updated_at: now, store_name: stores[0].short_name, needs_read: true };
    statements.push({ sql: `INSERT INTO ${table('custom_orders')} (id,store_id,order_ref,ship_date,notes,image,revision,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, params: [order.id, data.store_id, data.order_ref, data.ship_date, data.notes, data.image, 1, 'open', user.name, now, now] });
  } else {
    if (typeof body.id !== 'string' || !Number.isInteger(body.revision)) throw new Error('Pesanan / versi tidak valid.');
    const found = await rows<CustomOrder>(`SELECT o.*, s.short_name AS store_name FROM ${table('custom_orders')} o JOIN ${table('stores')} s ON s.id=o.store_id WHERE o.id=?`, [body.id]);
    if (!found.length) throw new Error('Pesanan tidak ditemukan.');
    order = found[0];
    if (customPhotoExpired(order)) {
      // Reopening an expired order must not revive historical copies.
      await purgeExpiredCustomPhotos();
      order.image = '';
    }
    if (order.revision !== body.revision) throw new Error('CONFLICT');
    const oldStatus = order.status;
    if (action === 'update') {
      const data = validateCustomOrder(body);
      const stores = await rows<{ short_name: string }>(`SELECT short_name FROM ${table('stores')} WHERE id=?`, [data.store_id]);
      if (!stores.length) throw new Error('Toko tidak ditemukan.');
      order = { ...order, ...data, store_name: stores[0].short_name, revision: order.revision + 1, status: 'open', updated_at: now };
      statements.push({ sql: `UPDATE ${table('custom_orders')} SET store_id=?,order_ref=?,ship_date=?,notes=?,image=?,revision=?,status='open',updated_at=? WHERE id=? AND revision=? AND status=?`, params: [data.store_id, data.order_ref, data.ship_date, data.notes, data.image, order.revision, now, order.id, Number(body.revision), oldStatus], check: true });
    } else {
      if (!['read', 'complete', 'issue'].includes(String(action))) throw new Error('Tindakan tidak valid.');
      if (oldStatus === 'done') throw new Error('CONFLICT');
      if (action === 'complete' && body.confirmed !== true) throw new Error('Centang konfirmasi bahwa pesanan sudah disiapkan.');
      if (action === 'complete') {
        const read = await rows(`SELECT id FROM ${table('custom_order_events')} WHERE order_id=? AND revision=? AND actor_id=? AND action='read' AND day=?`, [order.id, order.revision, user.id, customOrderDay()]);
        if (!read.length) throw new Error('Baca dan konfirmasi permintaan terlebih dahulu.');
      }
      order = { ...order, status: action === 'complete' ? 'done' : action === 'issue' ? 'issue' : oldStatus, updated_at: now };
      statements.push({ sql: `UPDATE ${table('custom_orders')} SET status=?,updated_at=? WHERE id=? AND revision=? AND status=?`, params: [order.status, now, order.id, order.revision, oldStatus], check: true });
    }
  }
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 2000 || (action === 'issue' && !note)) throw new Error('Isi alasan kendala, maksimal 2.000 karakter.');
  const eventAction = action === 'create' ? 'created' : action === 'update' ? 'updated' : action === 'complete' ? 'completed' : String(action);
  const snapshot = { ...order, image: action === 'create' || action === 'update' ? order.image : order.image ? photoUrl(order.id, order.revision) : '' };
  statements.push({ sql: `INSERT INTO ${table('custom_order_events')} (id,order_id,revision,action,actor_id,actor_name,day,created_at,note,snapshot) VALUES (?,?,?,?,?,?,?,?,?,?)`, params: [randomUUID(), order.id, order.revision, eventAction, user.id, user.name, customOrderDay(), now, note, JSON.stringify(snapshot)] });
  await batch(statements);
  return order.id;
}
