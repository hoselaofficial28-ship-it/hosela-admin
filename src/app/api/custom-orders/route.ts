import { NextRequest, NextResponse } from 'next/server';
import { canAccessFeature, getSession } from '@/lib/auth';
import { completedCustomOrders, completedCustomOrderCount, customOrderForEdit, customOrderHistory, isCustomOrderSetupMissing, listCustomOrders, maintainCustomPhotos, mutateCustomOrder } from '@/lib/custom-orders';

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Kesalahan penyimpanan pesanan custom.';
  if (/no such table|does not exist/.test(message)) return NextResponse.json({ error: 'Fitur pesanan custom belum diaktifkan. Owner perlu menjalankan migrasi pesanan custom terlebih dahulu.' }, { status: 503 });
  if (message === 'CONFLICT') return NextResponse.json({ error: 'Pesanan telah diubah atau diselesaikan admin lain. Muat ulang dan periksa versi terbaru.' }, { status: 409 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'Data permintaan tidak valid.' }, { status: 400 });
  return NextResponse.json({ error: message }, { status: 400 });
}
export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Silakan login kembali.' }, { status: 401 });
  if (!canAccessFeature(user, 'input')) return NextResponse.json({ error: 'Tidak memiliki akses Input Resi.' }, { status: 403 });
  try {
    await maintainCustomPhotos();
    const editId = req.nextUrl.searchParams.get('edit');
    if (editId) {
      if (user.role !== 'owner') return NextResponse.json({ error: 'Hanya owner yang dapat mengubah permintaan.' }, { status: 403 });
      const order = await customOrderForEdit(editId);
      return NextResponse.json(order ? { order } : { error: 'Pesanan tidak ditemukan.' }, { status: order ? 200 : 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const id = req.nextUrl.searchParams.get('history');
    if (id) return NextResponse.json({ events: await customOrderHistory(id) });
    if (req.nextUrl.searchParams.get('completed') === 'true') {
      const offset = Number(req.nextUrl.searchParams.get('offset') || 0);
      if (!Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: 'Halaman riwayat tidak valid.' }, { status: 400 });
      return NextResponse.json(await completedCustomOrders(req.nextUrl.searchParams.get('q') || '', offset), { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ orders: await listCustomOrders(user.id, true), completed_total: await completedCustomOrderCount(), can_manage: user.role === 'owner' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (!req.nextUrl.searchParams.has('history') && isCustomOrderSetupMissing(error)) {
      return NextResponse.json({ orders: [], can_manage: false, setup_required: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Silakan login kembali.' }, { status: 401 });
  if (!canAccessFeature(user, 'input')) return NextResponse.json({ error: 'Tidak memiliki akses Input Resi.' }, { status: 403 });
  if (Number(req.headers.get('content-length')) > 1_500_000) return NextResponse.json({ error: 'Ukuran permintaan terlalu besar.' }, { status: 413 });
  try {
    const raw = await req.text();
    if (raw.length > 1_500_000) return NextResponse.json({ error: 'Ukuran permintaan terlalu besar.' }, { status: 413 });
    const body = JSON.parse(raw);
    if (!body || Array.isArray(body) || typeof body !== 'object') return NextResponse.json({ error: 'Data tidak valid.' }, { status: 400 });
    if (['create', 'update'].includes(body.action) && user.role !== 'owner') return NextResponse.json({ error: 'Hanya owner yang dapat membuat atau mengubah permintaan custom.' }, { status: 403 });
    await maintainCustomPhotos();
    return NextResponse.json({ id: await mutateCustomOrder(user, body) });
  } catch (error) { return failure(error); }
}
