"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCheck, History, ImageOff, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import Image from 'next/image';
import { customOrderDay, customOrderNeedsPopup, type CustomOrder, type CustomOrderEvent } from '@/lib/custom-order-types';

type Store = { id: number; short_name: string };
const button = 'min-h-11 rounded-lg px-4 py-2 font-medium border border-gray-300 disabled:opacity-50 disabled:cursor-wait';
const primary = `${button} bg-blue-600 text-white border-blue-600 hover:bg-blue-700`;
const input = 'w-full min-h-11 rounded-lg border border-gray-300 p-3 text-base';
const time = (value: string) => new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
const day = (value: string) => new Date(value).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium' });

async function request(url: string, body?: Record<string, unknown>) {
  const signal = AbortSignal.timeout(20000);
  const res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal } : { cache: 'no-store', signal });
  const data = await res.json().catch(() => { throw new Error(`Server tidak mengirim data yang valid (${res.status}). Coba lagi.`); });
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
  const [failedImage, setFailedImage] = useState('');
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2 text-sm"><span className="rounded bg-blue-50 px-2 py-1 font-semibold text-blue-800">{order.store_name || `Toko #${order.store_id}`}</span><span className="rounded bg-gray-100 px-2 py-1">Target kirim: {order.ship_date}</span><span className="rounded bg-amber-100 px-2 py-1">{order.status === 'done' ? 'Selesai' : order.status === 'issue' ? 'Ada kendala' : 'Perlu diproses'}</span></div>
    <h3 className="break-words text-lg font-bold">{order.order_ref}</h3>
    {order.image && failedImage !== order.image && <button type="button" onClick={() => setEnlarged(!enlarged)} className="block w-full rounded-lg border border-gray-200 p-2 text-left" aria-expanded={enlarged}>
      <Image unoptimized src={order.image} onError={() => setFailedImage(order.image)} alt={`Referensi custom ${order.order_ref}`} width={1200} height={900} className={`w-full object-contain ${enlarged ? 'max-h-none' : 'max-h-56'}`} />
      <span className="text-sm text-blue-700">{enlarged ? 'Perkecil gambar' : 'Perbesar gambar'}</span>
    </button>}
    {order.photo_expired && <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-600">Masa simpan foto berakhir 7 hari setelah pesanan selesai. Catatan dan riwayat pelaksana tetap tersedia.</p>}
    {!order.photo_expired && order.image && failedImage === order.image && <p className="text-sm text-gray-600">Foto tidak tersedia atau gagal dimuat. <button className="text-blue-700 underline" onClick={() => setFailedImage('')}>Coba lagi</button></p>}
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
  const [notice, setNotice] = useState('');
  const [fetchError, setFetchError] = useState('');
  const [busy, setBusy] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [detail, setDetail] = useState<CustomOrder | null>(null);
  const [viewing, setViewing] = useState<CustomOrder | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<CustomOrder[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [gateDismissed, setGateDismissed] = useState('');
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
  const refreshRequest = useRef(0);
  const invalidateRefresh = useCallback(() => { refreshRequest.current++; }, []);
  const mutating = useRef(false);
  const refresh = useCallback(() => {
    const requestId = ++refreshRequest.current;
    return request('/api/custom-orders').then(data => {
      if (!alive.current || requestId !== refreshRequest.current) return;
      setOrders(data.orders); setCanManage(data.can_manage); setCanCreate(Boolean(data.can_create ?? data.can_manage)); setLoaded(true); setFetchError('');
      setSetupRequired(Boolean(data.setup_required));
      setCompletedTotal(data.completed_total || 0);
      return data as { orders: CustomOrder[] };
    }).catch(e => { if (alive.current && requestId === refreshRequest.current) setFetchError(e instanceof Error ? e.message : String(e)); });
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const poll = () => { if (!mutating.current && document.visibilityState === 'visible') void refresh(); };
    const interval = window.setInterval(poll, 30000);
    window.addEventListener('focus', poll);
    return () => { alive.current = false; invalidateRefresh(); clearInterval(interval); window.removeEventListener('focus', poll); };
  }, [refresh, invalidateRefresh]);
  useEffect(() => {
    if (!historyMode || !management) return;
    const requestId = ++historyRequest.current;
    const timer = window.setTimeout(() => {
      setHistoryLoading(true); setHistoryError(''); setSelected([]);
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
  // A pending follow-up returns to its detail dialog after the read receipt.
  // Do not interrupt an open edit/history dialog with background polling.
  const gate = form || history || viewing || deleteTargets.length > 0 ? undefined : pending.find(o => o.id === detail?.id) || pending[0];
  const gateKey = gate ? `${gate.id}:${gate.revision}:${customOrderDay()}` : '';
  // Closing the reminder only hides it: the read wall and the resi lock stay active.
  const gateOpen = Boolean(gate) && gateDismissed !== gateKey;
  const readChecked = Boolean(gateKey) && readAcknowledged === gateKey;
  useEffect(() => { onBlocked(!loaded || Boolean(fetchError) || pending.length > 0); onCount(active.length); }, [loaded, fetchError, pending.length, active.length, onBlocked, onCount]);

  async function act(body: Record<string, unknown>) {
    if (mutating.current) return;
    mutating.current = true;
    refreshRequest.current++;
    setBusy(true); setError('');
    try {
      const result = await request('/api/custom-orders', body);
      if (body.action === 'create' || body.action === 'update') {
        const revision = body.action === 'create' ? 1 : Number(body.revision) + 1;
        setDeferred(current => ({ management, keys: [...current.keys, `${result.id}:${revision}:${customOrderDay()}`] }));
      }
      if (body.action === 'read') {
        setOrders(current => current.map(order => order.id === body.id && order.revision === body.revision ? { ...order, needs_read: false } : order));
        // Keep the selected follow-up and any draft text intact.
      } else {
        setHistoryVersion(version => version + 1);
        setDetail(null); setHistory(null); setForm(null); setViewing(null); setDeleteTargets([]); setConfirmed(false); setNote('');
        if (body.action === 'delete') {
          setSelected([]);
          setNotice(body.ids && Array.isArray(body.ids) && body.ids.length > 1 ? `${body.ids.length} riwayat pesanan dihapus permanen.` : 'Riwayat pesanan dihapus permanen.');
        }
      }
      const latest = await refresh();
      if (body.action === 'read' && latest) {
        setDetail(current => current ? latest.orders.find(order => order.id === current.id) || null : null);
        setConfirmed(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      const latest = await refresh();
      if (latest) {
        setDetail(current => current ? latest.orders.find(order => order.id === current.id) || null : null);
        setConfirmed(false);
      }
    }
    finally { mutating.current = false; setBusy(false); }
  }
  // While a read receipt is still due, any action reopens the reminder instead of
  // opening a dialog behind it.
  const blockUntilRead = () => { if (!gate) return false; setGateDismissed(''); return true; };
  async function openEdit(order: CustomOrder) {
    if (busy || blockUntilRead()) return;
    setBusy(true); setError('');
    try { const data = await request(`/api/custom-orders?edit=${encodeURIComponent(order.id)}`); setDetail(null); setHistory(null); setViewing(null); setForm(data.order); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function openFollowUp(order: CustomOrder) {
    if (blockUntilRead()) return;
    setError('');
    setDeferred(current => ({ ...current, keys: current.keys.filter(key => !key.startsWith(`${order.id}:`)) }));
    setDetail(order); setHistory(null); setForm(null); setConfirmed(false); setNote('');
  }
  async function openHistory(order: CustomOrder) {
    if (blockUntilRead()) return;
    setBusy(true); setError('');
    try { const data = await request(`/api/custom-orders?history=${encodeURIComponent(order.id)}`); setDetail(order); setViewing(null); setHistory(data.events); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const errorBox = (error || fetchError) && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800"><p>{error || fetchError}</p><button type="button" disabled={busy} onClick={() => { setError(''); void refresh(); }} className={`${button} mt-2`}>Muat ulang</button></div>;

  return <>
    {errorBox}
    {busy && <p role="status" className="rounded-lg bg-blue-50 p-3 text-blue-800">Memproses, mohon tunggu…</p>}
    {setupRequired && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">Pesanan Custom belum diaktifkan pada database ini. Owner perlu mengaktifkan penyimpanannya. Pencatatan resi tetap dapat digunakan.</p>}
    {!loaded && !error && <p role="status" className="rounded-lg border bg-white p-4">Memeriksa pengingat pesanan custom…</p>}
    {gate && !gateOpen && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">Pengingat membaca ditutup. Input resi tetap terkunci sampai konfirmasi membaca dicatat. <button type="button" className={`${button} mt-2 block`} onClick={() => setGateDismissed('')}>Buka pengingat</button></p>}
    {active.length > 0 && <section className="sticky top-16 z-20 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 sm:p-5 md:top-0" aria-label="Pengingat pesanan custom">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="flex items-center gap-2 text-lg font-bold text-amber-950"><AlertTriangle size={24} />{active.length} pesanan custom belum selesai</h3><p className="mt-1 text-sm text-amber-900">Periksa permintaan sebelum paket dikirim. Sudah dibaca belum berarti sudah disiapkan.</p></div><button type="button" className={`${button} bg-white shrink-0`} onClick={() => setViewActive(!viewActive)}>{viewActive ? 'Ringkas daftar' : 'Lihat permintaan'}</button></div>
      {viewActive && !management && <div className="mt-4 space-y-3">{active.map(order => <div key={order.id} className="rounded-lg border bg-white p-3"><p className="font-semibold">{order.store_name} · {order.order_ref}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{order.notes}</p><button type="button" disabled={busy} className={`${button} mt-2`} onClick={() => openFollowUp(order)}>Buka & tindak lanjuti</button></div>)}</div>}
    </section>}
    {management && !setupRequired && <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">Pesanan Custom</h3>{canCreate && <button type="button" disabled={busy} className={primary} onClick={() => { setError(''); setForm({ store_id: stores[0]?.id, order_ref: '', notes: '', image: '', ship_date: customOrderDay() }); }}><Plus className="mr-1 inline" size={18} />Pesanan Custom</button>}</div>
      <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={!historyMode} className={`${button} ${!historyMode ? 'bg-gray-900 text-white' : ''}`} onClick={() => { setHistoryMode(false); setNotice(''); }}>Aktif ({active.length})</button><button type="button" aria-pressed={historyMode} className={`${button} ${historyMode ? 'bg-gray-900 text-white' : ''}`} onClick={() => { setHistoryMode(true); setHistoryVersion(v => v + 1); setNotice(''); }}>Riwayat selesai ({completedTotal})</button></div>
      {historyMode && <p className="text-sm text-gray-600">Foto disimpan selama 7 hari setelah konfirmasi selesai. Catatan dan riwayat pelaksana tetap tersimpan.</p>}
      {historyMode && <label className="block">Cari riwayat selesai<input type="search" className={`${input} mt-1`} placeholder="Nomor pesanan, pembeli, toko, atau catatan" value={search} onChange={e => { setSearch(e.target.value); setHistoryLoading(true); setNotice(''); }} /></label>}
      {historyMode && notice && <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-green-900">{notice}</p>}
      {historyMode && historyError && <p role="alert" className="text-red-700">{historyError} <button className={button} onClick={() => setHistoryVersion(v => v + 1)}>Coba lagi</button></p>}
      {historyMode && canManage && completed.orders.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" className="size-5" checked={completed.orders.every(order => selected.includes(order.id))} onChange={e => setSelected(e.target.checked ? completed.orders.map(order => order.id) : [])} aria-label="Pilih semua riwayat" /><span>Pilih semua ({completed.orders.length})</span></label>
        {selected.length > 0 && <button type="button" disabled={busy} className={`${button} border-red-600 bg-red-600 text-white hover:bg-red-700`} onClick={() => { setError(''); setNotice(''); setDeleteTargets(completed.orders.filter(order => selected.includes(order.id))); }}><Trash2 size={18} className="mr-1 inline" />Hapus terpilih ({selected.length})</button>}
      </div>}
      {historyMode ? <ul aria-label="Riwayat pesanan selesai" className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">{completed.orders.map(order => <li key={order.id} className={`flex items-center gap-3 px-2 py-2 sm:px-3 ${selected.includes(order.id) ? 'bg-red-50/40' : ''}`}>
        {canManage && <input type="checkbox" className="size-5 shrink-0" checked={selected.includes(order.id)} onChange={e => setSelected(current => e.target.checked ? [...current.filter(id => id !== order.id), order.id] : current.filter(id => id !== order.id))} aria-label={`Pilih ${order.order_ref}`} />}
        <button type="button" onClick={() => setViewing(order)} aria-label={`Buka detail ${order.order_ref}`} className="shrink-0 rounded-lg">
          {order.image ? <Image unoptimized src={order.image} alt="" width={96} height={96} className="size-14 rounded-lg border border-gray-200 object-cover" /> : <span className="flex size-14 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-400"><ImageOff size={20} /></span>}
        </button>
        <button type="button" onClick={() => setViewing(order)} className="min-w-0 flex-1 text-left">
          <span className="block truncate font-semibold text-gray-900">{order.order_ref}</span>
          <span className="block truncate text-sm text-gray-600">{order.store_name} · selesai {day(order.updated_at)}</span>
          <span className="block truncate text-sm text-gray-500">{order.notes}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" disabled={busy} className={`${button} px-3`} aria-label={`Riwayat aktivitas ${order.order_ref}`} onClick={() => openHistory(order)}><History size={18} /></button>
          {canManage && <button type="button" disabled={busy} className={`${button} border-red-200 px-3 text-red-700 hover:bg-red-50`} aria-label={`Hapus riwayat ${order.order_ref}`} onClick={() => { setError(''); setNotice(''); setDeleteTargets([order]); }}><Trash2 size={18} /></button>}
        </div>
      </li>)}</ul> : <div className="grid gap-4 md:grid-cols-2">{active.map(order => <article key={order.id} className="min-w-0 space-y-3 rounded-lg border border-gray-200 p-4">
        <OrderDetail order={order} />
        <div className="flex flex-wrap gap-2">{order.status !== 'done' && <button type="button" disabled={busy} className={primary} onClick={() => openFollowUp(order)}>Tindak lanjuti</button>}<button type="button" className={button} disabled={busy} onClick={() => openHistory(order)}>Riwayat aktivitas</button>{canManage && <button type="button" disabled={busy} className={button} onClick={() => openEdit(order)}>Ubah permintaan</button>}</div>
      </article>)}</div>}
      {historyMode && <div className="flex flex-wrap items-center gap-3"><p className="text-sm text-gray-600" role="status">{historyLoading ? 'Memuat riwayat…' : `Menampilkan ${completed.orders.length} dari ${completed.total} hasil`}</p>{completed.has_more && <button type="button" disabled={historyLoading} className={button} onClick={loadMore}>Muat lebih banyak</button>}</div>}
      {loaded && !historyLoading && !(historyMode ? completed.orders.length : active.length) && <p className="py-5 text-gray-600">{historyMode ? search ? 'Tidak ada riwayat yang cocok dengan pencarian.' : 'Belum ada pesanan yang dikonfirmasi selesai.' : 'Tidak ada pesanan custom aktif.'}</p>}
    </section>}
    {gateOpen && gate && <Modal key={gateKey} title={`Wajib dibaca · ${pending.length} permintaan custom`} onClose={() => setGateDismissed(gateKey)}>
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
    {!gate && deleteTargets.length === 0 && viewing && <Modal title="Detail pesanan selesai" onClose={() => { if (!busy) setViewing(null); }}>
      <OrderDetail order={viewing} />
      <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">Pesanan ini sudah dikonfirmasi selesai. Catatan dan foto tetap tersimpan sampai batas 7 hari atau sampai riwayat dihapus manual.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={button} onClick={() => openHistory(viewing)}>Riwayat aktivitas</button>
        {canManage && <button type="button" disabled={busy} className={button} onClick={() => openEdit(viewing)}>Ubah permintaan</button>}
        {canManage && <button type="button" disabled={busy} className={`${button} border-red-200 text-red-700 hover:bg-red-50`} onClick={() => { setNotice(''); setError(''); setDeleteTargets([viewing]); }}><Trash2 size={18} className="mr-1 inline" />Hapus riwayat</button>}
      </div>
    </Modal>}
    {!gate && deleteTargets.length > 0 && <Modal title={deleteTargets.length > 1 ? `Hapus ${deleteTargets.length} riwayat pesanan` : 'Hapus riwayat pesanan'} onClose={() => { if (!busy) setDeleteTargets([]); }}>
      <p className="text-gray-700">{deleteTargets.length > 1 ? 'Riwayat terpilih beserta foto dan seluruh aktivitasnya akan dihapus permanen.' : <>Riwayat <strong className="break-words">{deleteTargets[0].order_ref}</strong> beserta foto dan seluruh riwayat aktivitasnya akan dihapus permanen.</>} Tindakan ini tidak dapat dibatalkan.</p>
      {deleteTargets.length > 1 && <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-3 text-sm text-gray-700">{deleteTargets.map(order => <li key={order.id} className="truncate">• {order.order_ref} · {order.store_name}</li>)}</ul>}
      {errorBox}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={button} onClick={() => setDeleteTargets([])}>Batal</button>
        <button type="button" disabled={busy} className={`${button} border-red-600 bg-red-600 text-white hover:bg-red-700`} onClick={() => void act({ action: 'delete', ids: deleteTargets.map(order => order.id) })}>{busy ? 'Menghapus…' : deleteTargets.length > 1 ? `Hapus ${deleteTargets.length} permanen` : 'Hapus permanen'}</button>
      </div>
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
