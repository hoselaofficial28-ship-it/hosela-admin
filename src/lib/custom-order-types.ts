export interface CustomOrder {
  id: string;
  store_id: number;
  store_name: string;
  order_ref: string;
  ship_date: string;
  notes: string;
  image: string;
  revision: number;
  status: 'open' | 'issue' | 'done';
  created_by: string;
  created_at: string;
  updated_at: string;
  needs_read: boolean;
  photo_expired?: boolean;
}
export const CUSTOM_PHOTO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export function customPhotoExpired(order: Pick<CustomOrder, 'status' | 'updated_at'>, now = Date.now()) {
  return order.status === 'done' && Date.parse(order.updated_at) <= now - CUSTOM_PHOTO_RETENTION_MS;
}
export interface CustomOrderEvent {
  id: string;
  order_id: string;
  revision: number;
  action: 'created' | 'updated' | 'read' | 'completed' | 'issue';
  actor_name: string;
  created_at: string;
  note: string;
  snapshot: string;
}
export function customOrderDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
// Deferrals live only in the current menu visit; they never record a read receipt.
export function customOrderNeedsPopup(order: CustomOrder, deferredKeys: string[], management: boolean, day = customOrderDay()) {
  return order.status !== 'done' && Boolean(order.needs_read)
    && !(management && deferredKeys.includes(`${order.id}:${order.revision}:${day}`));
}
export function validateCustomOrder(body: Record<string, unknown>) {
  const store_id = Number(body.store_id);
  const order_ref = typeof body.order_ref === 'string' ? body.order_ref.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const ship_date = typeof body.ship_date === 'string' ? body.ship_date : '';
  const image = typeof body.image === 'string' ? body.image : '';
  if (!Number.isSafeInteger(store_id) || store_id < 1) throw new Error('Pilih toko yang valid.');
  if (!order_ref || order_ref.length > 160) throw new Error('Nomor pesanan / username pembeli wajib diisi, maksimal 160 karakter.');
  if (!notes || notes.length > 5000) throw new Error('Catatan wajib diisi, maksimal 5.000 karakter.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ship_date) || !Number.isFinite(Date.parse(ship_date)) || new Date(ship_date).toISOString().slice(0, 10) !== ship_date) throw new Error('Tanggal target kirim tidak valid.');
  if (image.length > 1_400_000 || (image && !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image))) throw new Error('Foto harus JPEG, maksimal 1 MB setelah diperkecil.');
  return { store_id, order_ref, notes, ship_date, image };
}
