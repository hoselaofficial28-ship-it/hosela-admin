"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCheck, ImagePlus, Plus, X } from 'lucide-react';
import Image from 'next/image';
import { customOrderDay, customOrderNeedsPopup, type CustomOrder, type CustomOrderEvent } from '@/lib/custom-order-types';

type Store = { id: number; short_name: string };
const button = 'min-h-11 rounded-lg px-4 py-2 font-medium border border-gray-300 disabled:opacity-50 disabled:cursor-wait';
const primary = `${button} bg-blue-600 text-white border-blue-600 hover:bg-blue-700`;
const input = 'w-full min-h-11 rounded-lg border border-gray-300 p-3 text-base';
const time = (value: string) => new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });

async function request(url: string, body?: Record<string, unknown>) {
  const res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Permintaan gagal (${res.status}).`);
  return data;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog ref={ref} aria-label={title} onCancel={e => { e.preventDefault(); onClose?.(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl bg-white p-4 sm:p-6 shadow-xl backdrop:bg-black/60">
    <div className="mb-4 flex items-start justify-between gap-4"><h2 className="text-xl font-bold">{title}</h2>{onClose && <button type="button" onClick={onClose} className={button} aria-label="Tutup"><X size={20} /></button>}</div>
    {children}
  </dialog>;
}

function OrderDetail({ order }: { order: CustomOrder }) {
  const [enlarged, setEnlarged] = useState(false);
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2 text-sm"><span className="rounded bg-blue-50 px-2 py-1 font-semibold text-blue-800">{order.store_name || `Toko #${order.store_id}`}</span><span className="rounded bg-gray-100 px-2 py-1">Target kirim: {order.ship_date}</span><span className="rounded bg-amber-100 px-2 py-1">{order.status === 'done' ? 'Selesai' : order.status === 'issue' ? 'Ada kendala' : 'Perlu diproses'}</span></div>
    <h3 className="break-words text-lg font-bold">{order.order_ref}</h3>
    {order.image && <button type="button" onClick={() => setEnlarged(!enlarged)} className="block w-full rounded-lg border border-gray-200 p-2 text-left" aria-expanded={enlarged}>
      <Image unoptimized src={order.image} alt={`Referensi custom ${order.order_ref}`} width={1200} height={900} className={`w-full object-contain ${enlarged ? 'max-h-none' : 'max-h-56'}`} />
      <span className="text-sm text-blue-700">{enlarged ? 'Perkecil gambar' : 'Perbesar gambar'}</span>
    </button>}
    <p className="whitespace-pre-wrap break-words rounded-lg border border-amber-200 bg-amber-50 p-4 text-base text-gray-900">{order.notes}</p>
    <p className="text-sm text-gray-600">Dibuat oleh {order.created_by} · {time(order.created_at)} · Versi {order.revision}</p>
  </div>;
}

async function compressPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Pilih foto JPG, PNG, atau WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Foto asli maksimal 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Browser tidak dapat memproses gambar.');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const photo = canvas.toDataURL('image/jpeg', 0.8);
    if (photo.length > 1_400_000) throw new Error('Gambar masih terlalu besar. Pilih foto yang lebih kecil.');
    return photo;
  } finally { bitmap.close(); }
}

export default function CustomOrders({ stores, management, onBlocked, onCount }: {
  stores: Store[]; management: boolean; onBlocked: (blocked: boolean) => void; onCount: (count: number) => void;
}) {
  const [orders, setOrders] = useState<CustomOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [detail, setDetail] = useState<CustomOrder | null>(null);
  const [history, setHistory] = useState<CustomOrderEvent[] | null>(null);
  const [historyMode, setHistoryMode] = useState(false);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [historyVersion, setHistoryVersion] = useState(0);
  const [completed, setCompleted] = useState<{ orders: CustomOrder[]; total: number; has_more: boolean }>({ orders: [], total: 0, has_more: false });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const historyRequest = useRef(0);
  const invalidateHistory = useCallback(() => { historyRequest.current++; }, []);
  const [deferred, setDeferred] = useState<{ management: boolean; keys: string[] }>({ management, keys: [] });
  if (deferred.management !== management) setDeferred({ management, keys: [] });
  const [form, setForm] = useState<Partial<CustomOrder> | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');
  const [readAcknowledged, setReadAcknowledged] = useState('');
  const [viewActive, setViewActive] = useState(false);
  const alive = useRef(true);
  const refresh = useCallback(() => {
    return request('/api/custom-orders').then(data => {
      if (!alive.current) return;
      setOrders(data.orders); setCanManage(data.can_manage); setLoaded(true); setError('');
      setSetupRequired(Boolean(data.setup_required));
      setCompletedTotal(data.completed_total || 0);
    }).catch(e => { if (alive.current) setError(e instanceof Error ? e.message : String(e)); });
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { alive.current = false; clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  useEffect(() => {
    if (!historyMode || !management) return;
    const requestId = ++historyRequest.current;
    const timer = window.setTimeout(() => {
      setHistoryLoading(true); setHistoryError('');
      request(`/api/custom-orders?completed=true&q=${encodeURIComponent(search)}`).then(data => {
        if (requestId === historyRequest.current) setCompleted({ orders: data.orders, total: data.total || 0, has_more: Boolean(data.has_more) });
      }).catch(e => {
        if (requestId === historyRequest.current) setHistoryError(e instanceof Error ? e.message : String(e));
      }).finally(() => { if (requestId === historyRequest.current) setHistoryLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); invalidateHistory(); };
  }, [historyMode, management, search, historyVersion, invalidateHistory]);
  async function loadMore() {
    const requestId = ++historyRequest.current;
    setHistoryLoading(true); setHistoryError('');
    try {
      const data = await request(`/api/custom-orders?completed=true&q=${encodeURIComponent(search)}&offset=${completed.orders.length}`);
      if (requestId === historyRequest.current) setCompleted(previous => ({ orders: [...previous.orders, ...data.orders.filter((o: CustomOrder) => !previous.orders.some(p => p.id === o.id))], total: data.total, has_more: data.has_more }));
    } catch (e) { if (requestId === historyRequest.current) setHistoryError(e instanceof Error ? e.message : String(e)); }
    finally { if (requestId === historyRequest.current) setHistoryLoading(false); }
  }
  const active = orders.filter(o => o.status !== 'done');
  const pending = active.filter(o => customOrderNeedsPopup(o, deferred.management === management ? deferred.keys : [], management));
  const gate = busy && form ? undefined : pending[0];
  const gateKey = gate ? `${gate.id}:${gate.revision}:${customOrderDay()}` : '';
  const readChecked = Boolean(gateKey) && readAcknowledged === gateKey;
  useEffect(() => { onBlocked(!loaded || Boolean(error) || pending.length > 0); onCount(active.length); }, [loaded, error, pending.length, active.length, onBlocked, onCount]);

  async function act(body: Record<string, unknown>) {
    setBusy(true); setError('');
    try {
      const result = await request('/api/custom-orders', body);
      if (body.action === 'create' || body.action === 'update') {
        const revision = body.action === 'create' ? 1 : Number(body.revision) + 1;
        setDeferred(current => ({ management, keys: [...current.keys, `${result.id}:${revision}:${customOrderDay()}`] }));
      }
      setHistoryVersion(version => version + 1);
      // Preserve acknowledgement/completion dialogs until the server confirms success.
      setDetail(null); setHistory(null); setForm(null); setConfirmed(false); setNote('');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); await refreshAfterConflict(); }
    finally { setBusy(false); }
  }
  async function refreshAfterConflict() {
    try {
      const data = await request('/api/custom-orders');
      setOrders(data.orders);
    } catch { /* Keep the original error visible; do not unlock inputs. */ }
  }
  async function openHistory(order: CustomOrder) {
    setBusy(true); setError('');
    try { const data = await request(`/api/custom-orders?history=${encodeURIComponent(order.id)}`); setDetail(order); setHistory(data.events); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const errorBox = error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800"><p>{error}</p><button type="button" onClick={refresh} className={`${button} mt-2`}>Muat ulang</button></div>;

  return <>
    {errorBox}
    {setupRequired && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">Pesanan Custom belum diaktifkan pada database ini. Owner perlu mengaktifkan penyimpanannya. Pencatatan resi tetap dapat digunakan.</p>}
    {!loaded && !error && <p role="status" className="rounded-lg border bg-white p-4">Memeriksa pengingat pesanan custom…</p>}
    {active.length > 0 && <section className="sticky top-16 z-20 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 sm:p-5 md:top-0" aria-label="Pengingat pesanan custom">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="flex items-center gap-2 text-lg font-bold text-amber-950"><AlertTriangle size={24} />{active.length} pesanan custom belum selesai</h3><p className="mt-1 text-sm text-amber-900">Periksa permintaan sebelum paket dikirim. Sudah dibaca belum berarti sudah disiapkan.</p></div><button type="button" className={`${button} bg-white shrink-0`} onClick={() => setViewActive(!viewActive)}>{viewActive ? 'Ringkas daftar' : 'Lihat permintaan'}</button></div>
      {viewActive && !management && <div className="mt-4 space-y-3">{active.map(order => <div key={order.id} className="rounded-lg border bg-white p-3"><p className="font-semibold">{order.store_name} · {order.order_ref}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{order.notes}</p><button type="button" className={`${button} mt-2`} onClick={() => { setDetail(order); setHistory(null); setConfirmed(false); setNote(''); }}>Buka & tindak lanjuti</button></div>)}</div>}
    </section>}
    {management && !setupRequired && <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">Pesanan Custom</h3>{canManage && <button type="button" className={primary} onClick={() => setForm({ store_id: stores[0]?.id, order_ref: '', notes: '', image: '', ship_date: customOrderDay() })}><Plus className="mr-1 inline" size={18} />Pesanan Custom</button>}</div>
      <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={!historyMode} className={`${button} ${!historyMode ? 'bg-gray-900 text-white' : ''}`} onClick={() => setHistoryMode(false)}>Aktif ({active.length})</button><button type="button" aria-pressed={historyMode} className={`${button} ${historyMode ? 'bg-gray-900 text-white' : ''}`} onClick={() => { setHistoryMode(true); setHistoryVersion(v => v + 1); }}>Riwayat selesai ({completedTotal})</button></div>
      {historyMode && <label className="block">Cari riwayat selesai<input type="search" className={`${input} mt-1`} placeholder="Nomor pesanan, pembeli, toko, atau catatan" value={search} onChange={e => { setSearch(e.target.value); setHistoryLoading(true); }} /></label>}
      {historyMode && historyError && <p role="alert" className="text-red-700">{historyError} <button className={button} onClick={() => setHistoryVersion(v => v + 1)}>Coba lagi</button></p>}
      <div className="grid gap-4 md:grid-cols-2">{(historyMode ? completed.orders : active).map(order => <article key={order.id} className="min-w-0 space-y-3 rounded-lg border border-gray-200 p-4">
        <OrderDetail order={order} />
        <div className="flex flex-wrap gap-2">{order.status !== 'done' && <button type="button" className={primary} onClick={() => { setDeferred({ management, keys: [] }); setDetail(order); setHistory(null); setConfirmed(false); setNote(''); }}>Tindak lanjuti</button>}<button type="button" className={button} disabled={busy} onClick={() => openHistory(order)}>Riwayat aktivitas</button>{canManage && <button type="button" className={button} onClick={() => setForm(order)}>Ubah permintaan</button>}</div>
      </article>)}</div>
      {historyMode && <div className="flex flex-wrap items-center gap-3"><p className="text-sm text-gray-600" role="status">{historyLoading ? 'Memuat riwayat…' : `Menampilkan ${completed.orders.length} dari ${completed.total} hasil`}</p>{completed.has_more && <button type="button" disabled={historyLoading} className={button} onClick={loadMore}>Muat lebih banyak</button>}</div>}
      {loaded && !historyLoading && !(historyMode ? completed.orders.length : active.length) && <p className="py-5 text-gray-600">{historyMode ? search ? 'Tidak ada riwayat yang cocok dengan pencarian.' : 'Belum ada pesanan yang dikonfirmasi selesai.' : 'Tidak ada pesanan custom aktif.'}</p>}
    </section>}
    {gate && <Modal key={gateKey} title={`Wajib dibaca · ${pending.length} permintaan custom`}>
      <p className="mb-4 text-gray-700">Periksa permintaan berikut sebelum mengisi resi. Konfirmasi membaca akan mencatat nama dan waktu Anda.</p>
      <OrderDetail order={gate} />
      <label className="my-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3"><input type="checkbox" checked={readChecked} onChange={e => setReadAcknowledged(e.target.checked ? gateKey : '')} className="mt-1 size-5 shrink-0" /><span>Saya sudah membaca gambar dan catatan permintaan ini.</span></label>
      {errorBox}<button type="button" disabled={busy || !readChecked} className={`${primary} mt-3 w-full`} onClick={() => act({ action: 'read', id: gate.id, revision: gate.revision })}>{busy ? 'Menyimpan…' : pending.length > 1 ? 'Sudah membaca, lihat permintaan berikutnya' : 'Saya sudah membaca, lanjut input resi'}</button>
      <p className="mt-3 text-sm text-gray-600">Pengingat tetap aktif sampai pesanan dikonfirmasi sudah disiapkan.</p>
    </Modal>}
    {!gate && detail && <Modal title={history ? 'Riwayat aktivitas pesanan' : 'Tindak lanjut pesanan custom'} onClose={() => { if (!busy) { setDetail(null); setHistory(null); } }}>
      <OrderDetail order={detail} />
      {history ? <div className="mt-5 space-y-3">{history.map(event => {
        const labels = { created: 'Permintaan dibuat', updated: 'Permintaan diubah / dibuka ulang', read: 'Sudah membaca', completed: 'Sudah disiapkan sesuai permintaan', issue: 'Ada kendala' };
        return <div key={event.id} className="rounded-lg border p-3"><p className="font-semibold">{labels[event.action]}</p><p className="text-sm">{event.actor_name} · {time(event.created_at)} · Versi {event.revision}</p>{event.note && <p className="mt-2 whitespace-pre-wrap break-words">{event.note}</p>}<details className="mt-2"><summary className="cursor-pointer text-blue-700">Lihat permintaan saat aktivitas ini</summary><div className="mt-3"><OrderDetail order={JSON.parse(event.snapshot)} /></div></details></div>;
      })}</div> : <div className="mt-4 space-y-3">
        <label className="block">Catatan hasil / alasan kendala<textarea className={`${input} mt-1`} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>Saya sudah memeriksa pesanan dan menyiapkannya sesuai gambar serta catatan permintaan.</span></label>
        {errorBox}<button type="button" disabled={busy || !confirmed} className={`${primary} w-full`} onClick={() => act({ action: 'complete', id: detail.id, revision: detail.revision, confirmed, note })}><CheckCheck size={18} className="mr-2 inline" />Konfirmasi sudah disiapkan</button>
        <button type="button" disabled={busy || !note.trim()} className={`${button} w-full`} onClick={() => act({ action: 'issue', id: detail.id, revision: detail.revision, note })}>Ada kendala — pengingat tetap aktif</button>
      </div>}
    </Modal>}
    {!gate && form && <Modal title={form.id ? 'Ubah permintaan custom' : 'Tambah pesanan custom'} onClose={() => { if (!busy && !photoBusy) setForm(null); }}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void act({ ...form, action: form.id ? 'update' : 'create' }); }}>
        {form.id && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">Perubahan akan meminta admin membaca ulang. Pesanan yang sudah selesai akan dibuka kembali; riwayat lama tetap tersimpan.</p>}
        <label className="block">Toko<select required className={`${input} mt-1`} value={form.store_id || ''} onChange={e => setForm({ ...form, store_id: Number(e.target.value) })}><option value="">Pilih toko</option>{stores.map(s => <option key={s.id} value={s.id}>{s.short_name}</option>)}</select></label>
        <label className="block">Nomor pesanan / username pembeli<input required maxLength={160} className={`${input} mt-1`} value={form.order_ref || ''} onChange={e => setForm({ ...form, order_ref: e.target.value })} /></label>
        <label className="block">Target kirim<input required type="date" className={`${input} mt-1`} value={form.ship_date || ''} onChange={e => setForm({ ...form, ship_date: e.target.value })} /></label>
        <label className="block">Catatan permintaan<textarea required rows={4} maxLength={5000} className={`${input} mt-1`} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        <label className="block"><ImagePlus className="mr-2 inline" size={18} />Gambar referensi / screenshot chat (opsional)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={photoBusy || busy} className={`${input} mt-1`} onChange={async e => {
          const file = e.target.files?.[0]; if (!file) return;
          setPhotoBusy(true); setError('');
          try { const image = await compressPhoto(file); setForm(current => current ? { ...current, image } : current); }
          catch (err) { setError(err instanceof Error ? err.message : String(err)); }
          finally { setPhotoBusy(false); }
        }} /></label>
        <p className="text-sm text-gray-600">JPG/PNG/WebP maksimal 10 MB. Foto otomatis diperkecil untuk penyimpanan.</p>
        {form.image && <div><Image unoptimized src={form.image} alt="Pratinjau referensi" width={600} height={400} className="max-h-56 w-full object-contain" /><button type="button" className={`${button} mt-2`} onClick={() => setForm({ ...form, image: '' })}>Lepas gambar</button></div>}
        {errorBox}<button disabled={busy || photoBusy} type="submit" className={`${primary} w-full`}>{photoBusy ? 'Memproses foto…' : busy ? 'Menyimpan…' : 'Simpan permintaan custom'}</button>
      </form>
    </Modal>}
  </>;
}
