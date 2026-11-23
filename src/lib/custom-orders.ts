import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import { hasPostgres, pgQuery, pgTransaction } from './pg';
import { customOrderDay, validateCustomOrder, type CustomOrder, type CustomOrderEvent } from './custom-order-types';
import type { SessionUser } from './auth';

export function isCustomOrderSetupMissing(error: unknown) {
  return error instanceof Error && /(?:no such table|does not exist)/.test(error.message)
    && /(?:hn_)?custom_orders|(?:hn_)?custom_order_events/.test(error.message);
}

const table = (name: string) => `${hasPostgres() ? 'hn_' : ''}${name}`;
const placeholders = (sql: string) => { let n = 0; return sql.replace(/\?/g, () => `$${++n}`); };
async function rows<T>(sql: string, params: (string | number)[] = []): Promise<T[]> {
  if (hasPostgres()) return (await pgQuery(placeholders(sql), params)).rows as T[];
  return getDb().prepare(sql).all(...params) as T[];
}
// The conditional write and its audit event either both commit or both roll back.
async function batch(statements: { sql: string; params: (string | number)[]; check?: boolean }[]) {
  if (hasPostgres()) {
    await pgTransaction(async client => {
      for (const s of statements) {
        const result = await client.query(placeholders(s.sql), s.params);
        if (s.check && result.rowCount !== 1) throw new Error('CONFLICT');
      }
    });
  } else {
    const db = getDb();
    db.transaction(() => {
      for (const s of statements) {
        const result = db.prepare(s.sql).run(...s.params);
        if (s.check && result.changes !== 1) throw new Error('CONFLICT');
      }
    })();
  }
}
export async function listCustomOrders(userId: number) {
  return rows<CustomOrder>(`SELECT o.*, s.short_name AS store_name,
    CASE WHEN o.status != 'done' AND NOT EXISTS (
      SELECT 1 FROM ${table('custom_order_events')} e WHERE e.order_id=o.id AND e.revision=o.revision
      AND e.action='read' AND e.actor_id=? AND e.day=?
    ) THEN 1 ELSE 0 END AS needs_read
    FROM ${table('custom_orders')} o JOIN ${table('stores')} s ON s.id=o.store_id
    WHERE o.status != 'done' OR o.id IN (SELECT id FROM ${table('custom_orders')} WHERE status='done' ORDER BY updated_at DESC LIMIT 100)
    ORDER BY o.ship_date ASC, o.created_at ASC`, [userId, customOrderDay()]);
}
export async function customOrderHistory(id: string) {
  return rows<CustomOrderEvent>(`SELECT * FROM ${table('custom_order_events')} WHERE order_id=? ORDER BY created_at DESC, id DESC`, [id]);
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
  statements.push({ sql: `INSERT INTO ${table('custom_order_events')} (id,order_id,revision,action,actor_id,actor_name,day,created_at,note,snapshot) VALUES (?,?,?,?,?,?,?,?,?,?)`, params: [randomUUID(), order.id, order.revision, eventAction, user.id, user.name, customOrderDay(), now, note, JSON.stringify(order)] });
  await batch(statements);
  return order.id;
}
