"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, Calculator, CalendarDays, Clock3, Flame, PackageCheck,
  Plus, Save, Sun, Sunset, Trash2, Zap,
} from "lucide-react";
import Toast from "@/components/Toast";
import { formatDateShort } from "@/lib/utils";

interface Store {
  id: number;
  name: string;
  short_name: string;
  color: string;
  sort_order: number;
}

interface SessionQuantity {
  morning: number;
  afternoon: number;
}

interface PeakTime {
  id: number;
  date: string;
  store_id: number;
  start_time: string;
  end_time: string;
  order_count: number;
  notes: string | null;
  store_name: string;
  store_color: string;
}

interface ExpressShipment {
  id: number;
  store_id: number;
  start_date: string;
  end_date: string;
  quantity: number;
  notes: string | null;
  store_name: string;
  store_color: string;
}

type TabKey = "daily" | "peak" | "express";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "daily", label: "Resi Harian", icon: <PackageCheck className="w-4 h-4" /> },
  { key: "peak", label: "Jam Ramai", icon: <Flame className="w-4 h-4" /> },
  { key: "express", label: "Pengiriman Kilat", icon: <Zap className="w-4 h-4" /> },
];

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function monthEnd(date: string) {
  const [year, month] = date.split("-").map(Number);
  return new Date(year, month, 0).toISOString().split("T")[0];
}

function timeToHour(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return (hour || 0) + (minute || 0) / 60;
}

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}.00`;
}

export default function InputPage() {
  const today = todayKey();
  const [activeTab, setActiveTab] = useState<TabKey>("daily");
  const [date, setDate] = useState(today);
  const [stores, setStores] = useState<Store[]>([]);
  const [quantities, setQuantities] = useState<Record<number, SessionQuantity>>({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isExisting, setIsExisting] = useState(false);

  const [peakRows, setPeakRows] = useState<PeakTime[]>([]);
  const [peakForm, setPeakForm] = useState({
    date: today,
    store_id: "",
    start_time: "",
    end_time: "",
    order_count: "",
    notes: "",
  });

  const [expressRows, setExpressRows] = useState<ExpressShipment[]>([]);
  const [expressForm, setExpressForm] = useState({
    store_id: "",
    start_date: monthStart(today),
    end_date: monthEnd(today),
    quantity: "",
    notes: "",
  });

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setStores(Array.isArray(d) ? d : []))
      .catch(() => setStores([]));
  }, []);

  useEffect(() => {
    if (stores.length === 0) return;

    fetch(`/api/shipments?date=${date}`)
      .then((res) => res.ok ? res.json() : [])
      .then((data) => {
        if (data.length > 0) {
          const q: Record<number, SessionQuantity> = {};
          for (const row of data) {
            q[row.store_id] = {
              morning: row.morning_quantity ?? row.quantity ?? 0,
              afternoon: row.afternoon_quantity ?? 0,
            };
          }
          setQuantities(q);
          setIsExisting(true);
        } else {
          setQuantities({});
          setIsExisting(false);
        }
      })
      .catch(() => {
        setQuantities({});
        setIsExisting(false);
      });
  }, [date, stores]);

  useEffect(() => {
    const current = todayKey();
    const peakStart = monthStart(current);
    const peakEnd = monthEnd(current);
    fetch(`/api/peak-times?start=${peakStart}&end=${peakEnd}`)
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setPeakRows(Array.isArray(data) ? data : []))
      .catch(() => setPeakRows([]));

    const expressStart = monthStart(current);
    const expressEnd = monthEnd(current);
    fetch(`/api/express-shipments?start=${expressStart}&end=${expressEnd}`)
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setExpressRows(Array.isArray(data) ? data : []))
      .catch(() => setExpressRows([]));
  }, []);

  async function refreshPeakRows() {
    const start = monthStart(peakForm.date || today);
    const end = monthEnd(peakForm.date || today);
    const res = await fetch(`/api/peak-times?start=${start}&end=${end}`);
    const data = res.ok ? await res.json() : [];
    setPeakRows(Array.isArray(data) ? data : []);
  }

  async function refreshExpressRows() {
    const start = monthStart(expressForm.start_date || today);
    const end = monthEnd(expressForm.end_date || today);
    const res = await fetch(`/api/express-shipments?start=${start}&end=${end}`);
    const data = res.ok ? await res.json() : [];
    setExpressRows(Array.isArray(data) ? data : []);
  }

  function getStoreTotal(storeId: number) {
    const row = quantities[storeId];
    return (row?.morning || 0) + (row?.afternoon || 0);
  }

  function updateQuantity(storeId: number, session: keyof SessionQuantity, value: string) {
    const numericValue = Math.max(0, parseInt(value) || 0);
    setQuantities((prev) => ({
      ...prev,
      [storeId]: {
        morning: prev[storeId]?.morning || 0,
        afternoon: prev[storeId]?.afternoon || 0,
        [session]: numericValue,
      },
    }));
  }

  const morningTotal = stores.reduce((sum, store) => sum + (quantities[store.id]?.morning || 0), 0);
  const afternoonTotal = stores.reduce((sum, store) => sum + (quantities[store.id]?.afternoon || 0), 0);
  const total = morningTotal + afternoonTotal;

  const peakSummary = useMemo(() => {
    const byStore = new Map<number, { store: string; color: string; count: number; slots: number }>();
    const byHour = new Map<number, number>();

    for (const row of peakRows) {
      const current = byStore.get(row.store_id) || { store: row.store_name, color: row.store_color, count: 0, slots: 0 };
      current.count += row.order_count || 0;
      current.slots += 1;
      byStore.set(row.store_id, current);

      const startHour = Math.floor(timeToHour(row.start_time));
      const endHour = Math.max(startHour + 1, Math.ceil(timeToHour(row.end_time)));
      for (let hour = startHour; hour < endHour; hour++) {
        byHour.set(hour % 24, (byHour.get(hour % 24) || 0) + 1);
      }
    }

    const busiestHour = Array.from(byHour.entries()).sort((a, b) => b[1] - a[1])[0];
    const busiestStore = Array.from(byStore.values()).sort((a, b) => b.slots - a.slots)[0];
    return {
      totalSlots: peakRows.length,
      totalOrders: peakRows.reduce((sum, row) => sum + (row.order_count || 0), 0),
      busiestHour: busiestHour ? hourLabel(busiestHour[0]) : "-",
      busiestStore: busiestStore?.store || "-",
    };
  }, [peakRows]);

  const expressSummary = useMemo(() => {
    const byStore = new Map<number, { store: string; color: string; quantity: number }>();
    for (const row of expressRows) {
      const current = byStore.get(row.store_id) || { store: row.store_name, color: row.store_color, quantity: 0 };
      current.quantity += row.quantity;
      byStore.set(row.store_id, current);
    }

    return {
      total: expressRows.reduce((sum, row) => sum + row.quantity, 0),
      stores: Array.from(byStore.values()).sort((a, b) => b.quantity - a.quantity),
    };
  }, [expressRows]);

  async function handleSaveDaily() {
    setLoading(true);
    try {
      const shipments = stores.map((s) => ({
        store_id: s.id,
        morning_quantity: quantities[s.id]?.morning || 0,
        afternoon_quantity: quantities[s.id]?.afternoon || 0,
      }));

      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, shipments }),
      });

      if (res.ok) {
        setToast({ message: isExisting ? "Data berhasil diperbarui!" : "Data berhasil disimpan!", type: "success" });
        setIsExisting(true);
      } else {
        setToast({ message: "Gagal menyimpan data", type: "error" });
      }
    } catch {
      setToast({ message: "Terjadi kesalahan", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePeak() {
    if (!peakForm.store_id || !peakForm.date || !peakForm.start_time || !peakForm.end_time) {
      setToast({ message: "Tanggal, toko, jam mulai, dan jam selesai wajib diisi", type: "error" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/peak-times", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...peakForm,
          store_id: Number(peakForm.store_id),
          order_count: Number(peakForm.order_count || 0),
        }),
      });

      if (!res.ok) throw new Error("failed");
      setToast({ message: "Jam ramai berhasil dicatat", type: "success" });
      setPeakForm((prev) => ({ ...prev, start_time: "", end_time: "", order_count: "", notes: "" }));
      await refreshPeakRows();
    } catch {
      setToast({ message: "Gagal menyimpan jam ramai", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletePeak(id: number) {
    await fetch(`/api/peak-times/${id}`, { method: "DELETE" });
    refreshPeakRows();
  }

  async function handleSaveExpress() {
    if (!expressForm.store_id || !expressForm.start_date || !expressForm.end_date || Number(expressForm.quantity) <= 0) {
      setToast({ message: "Toko, periode, dan total barang wajib diisi", type: "error" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/express-shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...expressForm,
          store_id: Number(expressForm.store_id),
          quantity: Number(expressForm.quantity),
        }),
      });

      if (!res.ok) throw new Error("failed");
      setToast({ message: "Pengiriman kilat berhasil dicatat", type: "success" });
      setExpressForm((prev) => ({ ...prev, quantity: "", notes: "" }));
      await refreshExpressRows();
    } catch {
      setToast({ message: "Gagal menyimpan pengiriman kilat", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteExpress(id: number) {
    await fetch(`/api/express-shipments/${id}`, { method: "DELETE" });
    refreshExpressRows();
  }

  const dayName = new Date(date + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long" });
  const isSunday = new Date(date + "T00:00:00").getDay() === 0;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto animate-fade-in space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Input Resi</h2>
        <p className="text-sm text-gray-500">Catat resi harian, jam ramai pesanan, dan pengiriman kilat</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-2 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition ${
              activeTab === tab.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "daily" && (
        <DailyShipmentPanel
          date={date}
          setDate={setDate}
          dayName={dayName}
          isSunday={isSunday}
          isExisting={isExisting}
          stores={stores}
          quantities={quantities}
          updateQuantity={updateQuantity}
          getStoreTotal={getStoreTotal}
          morningTotal={morningTotal}
          afternoonTotal={afternoonTotal}
          total={total}
          loading={loading}
          onSave={handleSaveDaily}
        />
      )}

      {activeTab === "peak" && (
        <PeakTimePanel
          stores={stores}
          form={peakForm}
          setForm={setPeakForm}
          rows={peakRows}
          summary={peakSummary}
          loading={loading}
          onSave={handleSavePeak}
          onRefresh={refreshPeakRows}
          onDelete={handleDeletePeak}
        />
      )}

      {activeTab === "express" && (
        <ExpressPanel
          stores={stores}
          form={expressForm}
          setForm={setExpressForm}
          rows={expressRows}
          summary={expressSummary}
          loading={loading}
          onSave={handleSaveExpress}
          onRefresh={refreshExpressRows}
          onDelete={handleDeleteExpress}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function DailyShipmentPanel({
  date,
  setDate,
  dayName,
  isSunday,
  isExisting,
  stores,
  quantities,
  updateQuantity,
  getStoreTotal,
  morningTotal,
  afternoonTotal,
  total,
  loading,
  onSave,
}: {
  date: string;
  setDate: (value: string) => void;
  dayName: string;
  isSunday: boolean;
  isExisting: boolean;
  stores: Store[];
  quantities: Record<number, SessionQuantity>;
  updateQuantity: (storeId: number, session: keyof SessionQuantity, value: string) => void;
  getStoreTotal: (storeId: number) => number;
  morningTotal: number;
  afternoonTotal: number;
  total: number;
  loading: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
          <CalendarDays className="w-4 h-4" />
          Tanggal
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
        />
        <div className="flex items-center gap-2 mt-2">
          <span className="text-sm text-gray-500">{dayName}</span>
          {isSunday && <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">Hari Minggu</span>}
          {isExisting && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Data sudah ada</span>}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.4fr_1fr_1fr_.8fr] gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <span>Toko</span>
          <span className="flex items-center gap-1.5"><Sun className="w-3.5 h-3.5" /> Sesi Pagi</span>
          <span className="flex items-center gap-1.5"><Sunset className="w-3.5 h-3.5" /> Sesi Siang/Sore</span>
          <span className="text-right">Total</span>
        </div>

        <div className="divide-y divide-gray-100">
          {stores.map((store) => (
            <div key={store.id} className="p-4 md:grid md:grid-cols-[1.4fr_1fr_1fr_.8fr] md:items-center md:gap-3">
              <StoreLabel store={store} subtext="Input sesi pagi dan siang/sore" />
              <NumberInput label="Sesi Pagi" icon={<Sun className="w-3.5 h-3.5" />} color={store.color} value={quantities[store.id]?.morning || ""} onChange={(value) => updateQuantity(store.id, "morning", value)} />
              <NumberInput label="Sesi Siang/Sore" icon={<Sunset className="w-3.5 h-3.5" />} color={store.color} value={quantities[store.id]?.afternoon || ""} onChange={(value) => updateQuantity(store.id, "afternoon", value)} />
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5 md:justify-end md:bg-transparent md:px-0">
                <span className="md:hidden text-sm font-medium text-gray-500">Total</span>
                <span className="text-xl font-bold text-gray-900">{getStoreTotal(store.id)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 bg-gray-50 px-4 py-3 border-t border-gray-100">
          <MiniTotal label="Total Pagi" value={morningTotal} />
          <MiniTotal label="Total Siang/Sore" value={afternoonTotal} />
          <MiniTotal label="Grand Total" value={total} alignRight highlight />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="flex items-center gap-2 text-sm font-medium text-gray-500">
            <Calculator className="w-4 h-4" />
            Total Pengiriman Otomatis
          </span>
          <span className="text-2xl font-bold text-gray-900">{total}</span>
        </div>

        <button
          onClick={onSave}
          disabled={loading || total === 0}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 transition"
        >
          <Save className="w-4 h-4" />
          {loading ? "Menyimpan..." : isExisting ? "Perbarui Data" : "Simpan Data"}
        </button>
      </div>
    </div>
  );
}

function PeakTimePanel({
  stores,
  form,
  setForm,
  rows,
  summary,
  loading,
  onSave,
  onRefresh,
  onDelete,
}: {
  stores: Store[];
  form: { date: string; store_id: string; start_time: string; end_time: string; order_count: string; notes: string };
  setForm: React.Dispatch<React.SetStateAction<{ date: string; store_id: string; start_time: string; end_time: string; order_count: string; notes: string }>>;
  rows: PeakTime[];
  summary: { totalSlots: number; totalOrders: number; busiestHour: string; busiestStore: string };
  loading: boolean;
  onSave: () => void;
  onRefresh: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 h-fit space-y-3">
        <div>
          <h3 className="font-semibold text-gray-900">Catat Jam Ramai</h3>
          <p className="text-xs text-gray-500 mt-1">Simpan slot waktu saat order mulai ramai di tiap toko</p>
        </div>
        <InputRow label="Tanggal">
          <input type="date" value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} className="field" />
        </InputRow>
        <InputRow label="Toko">
          <select value={form.store_id} onChange={(e) => setForm((prev) => ({ ...prev, store_id: e.target.value }))} className="field bg-white">
            <option value="">Pilih toko</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.short_name}</option>)}
          </select>
        </InputRow>
        <div className="grid grid-cols-2 gap-2">
          <InputRow label="Mulai">
            <input type="time" value={form.start_time} onChange={(e) => setForm((prev) => ({ ...prev, start_time: e.target.value }))} className="field" />
          </InputRow>
          <InputRow label="Selesai">
            <input type="time" value={form.end_time} onChange={(e) => setForm((prev) => ({ ...prev, end_time: e.target.value }))} className="field" />
          </InputRow>
        </div>
        <InputRow label="Jumlah pesanan di jam itu">
          <input type="number" min="0" inputMode="numeric" value={form.order_count} onChange={(e) => setForm((prev) => ({ ...prev, order_count: e.target.value }))} className="field" placeholder="Opsional" />
        </InputRow>
        <InputRow label="Catatan">
          <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="field min-h-20 resize-none" placeholder="contoh: live, iklan naik, flash sale" />
        </InputRow>
        <button onClick={onSave} disabled={loading} className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
          <Plus className="w-4 h-4" />
          {loading ? "Menyimpan..." : "Tambah Jam Ramai"}
        </button>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={<Clock3 className="w-4 h-4 text-blue-600" />} label="Slot Dicatat" value={summary.totalSlots} />
          <SummaryCard icon={<PackageCheck className="w-4 h-4 text-green-600" />} label="Order Tercatat" value={summary.totalOrders} />
          <SummaryCard icon={<Activity className="w-4 h-4 text-orange-600" />} label="Jam Sering Ramai" value={summary.busiestHour} />
          <SummaryCard icon={<Flame className="w-4 h-4 text-red-600" />} label="Toko Sering Ramai" value={summary.busiestStore} />
        </div>
        <DataListHeader title="Riwayat Jam Ramai Bulan Ini" onRefresh={onRefresh} />
        <div className="space-y-2">
          {rows.length === 0 ? (
            <EmptyState text="Belum ada catatan jam ramai" />
          ) : rows.map((row) => (
            <div key={row.id} className="bg-white rounded-lg border border-gray-100 shadow-sm p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <StorePill name={row.store_name} color={row.store_color} />
                  <span className="text-sm font-semibold text-gray-900">{row.start_time} - {row.end_time}</span>
                  {row.order_count > 0 && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{row.order_count} pesanan</span>}
                </div>
                <div className="text-xs text-gray-400 mt-1">{formatDateShort(row.date)}{row.notes ? ` - ${row.notes}` : ""}</div>
              </div>
              <button onClick={() => onDelete(row.id)} className="p-2 text-gray-300 hover:text-red-600 transition" title="Hapus">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExpressPanel({
  stores,
  form,
  setForm,
  rows,
  summary,
  loading,
  onSave,
  onRefresh,
  onDelete,
}: {
  stores: Store[];
  form: { store_id: string; start_date: string; end_date: string; quantity: string; notes: string };
  setForm: React.Dispatch<React.SetStateAction<{ store_id: string; start_date: string; end_date: string; quantity: string; notes: string }>>;
  rows: ExpressShipment[];
  summary: { total: number; stores: { store: string; color: string; quantity: number }[] };
  loading: boolean;
  onSave: () => void;
  onRefresh: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 h-fit space-y-3">
        <div>
          <h3 className="font-semibold text-gray-900">Catat Pengiriman Kilat</h3>
          <p className="text-xs text-gray-500 mt-1">Rekap total barang kilat per toko dan periode</p>
        </div>
        <InputRow label="Toko">
          <select value={form.store_id} onChange={(e) => setForm((prev) => ({ ...prev, store_id: e.target.value }))} className="field bg-white">
            <option value="">Pilih toko</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.short_name}</option>)}
          </select>
        </InputRow>
        <div className="grid grid-cols-2 gap-2">
          <InputRow label="Mulai">
            <input type="date" value={form.start_date} onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))} className="field" />
          </InputRow>
          <InputRow label="Selesai">
            <input type="date" value={form.end_date} onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))} className="field" />
          </InputRow>
        </div>
        <InputRow label="Total barang kilat">
          <input type="number" min="1" inputMode="numeric" value={form.quantity} onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))} className="field text-lg font-semibold" placeholder="0" />
        </InputRow>
        <InputRow label="Catatan">
          <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="field min-h-20 resize-none" placeholder="contoh: periode campaign, urgent, promo toko" />
        </InputRow>
        <button onClick={onSave} disabled={loading} className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
          <Plus className="w-4 h-4" />
          {loading ? "Menyimpan..." : "Tambah Pengiriman Kilat"}
        </button>
      </div>

      <div className="space-y-4">
        <div className="grid md:grid-cols-[1fr_2fr] gap-3">
          <SummaryCard icon={<Zap className="w-4 h-4 text-blue-600" />} label="Total Kilat Bulan Ini" value={summary.total} />
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
            <div className="text-xs font-medium text-gray-500 mb-2">Per Toko</div>
            {summary.stores.length === 0 ? (
              <div className="text-sm text-gray-400">Belum ada data</div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {summary.stores.map((store) => (
                  <div key={store.store} className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2">
                    <StorePill name={store.store} color={store.color} />
                    <span className="text-sm font-bold text-gray-900">{store.quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DataListHeader title="Riwayat Pengiriman Kilat Bulan Ini" onRefresh={onRefresh} />
        <div className="space-y-2">
          {rows.length === 0 ? (
            <EmptyState text="Belum ada pengiriman kilat" />
          ) : rows.map((row) => (
            <div key={row.id} className="bg-white rounded-lg border border-gray-100 shadow-sm p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <StorePill name={row.store_name} color={row.store_color} />
                  <span className="text-sm font-semibold text-gray-900">{row.quantity} barang</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {formatDateShort(row.start_date)} - {formatDateShort(row.end_date)}{row.notes ? ` - ${row.notes}` : ""}
                </div>
              </div>
              <button onClick={() => onDelete(row.id)} className="p-2 text-gray-300 hover:text-red-600 transition" title="Hapus">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StoreLabel({ store, subtext }: { store: Store; subtext?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 md:mb-0">
      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: store.color }} />
      <div>
        <div className="text-sm font-semibold text-gray-900">{store.short_name}</div>
        {subtext && <div className="text-xs text-gray-400 md:hidden">{subtext}</div>}
      </div>
    </div>
  );
}

function NumberInput({ label, icon, color, value, onChange }: { label: string; icon: React.ReactNode; color: string; value: number | string; onChange: (value: string) => void }) {
  return (
    <label className="block mb-3 md:mb-0">
      <span className="md:hidden flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">{icon} {label}</span>
      <input
        type="number"
        inputMode="numeric"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none transition text-lg font-semibold text-gray-900"
        style={{ ["--tw-ring-color" as string]: color }}
        placeholder="0"
      />
    </label>
  );
}

function InputRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function MiniTotal({ label, value, alignRight, highlight }: { label: string; value: number; alignRight?: boolean; highlight?: boolean }) {
  return (
    <div className={alignRight ? "text-right" : ""}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${highlight ? "text-blue-700" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">{icon}{label}</div>
      <div className="text-xl font-bold text-gray-900 mt-1 truncate">{value}</div>
    </div>
  );
}

function DataListHeader({ title, onRefresh }: { title: string; onRefresh: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <button onClick={onRefresh} className="text-xs font-semibold text-blue-600 hover:text-blue-700">Refresh</button>
    </div>
  );
}

function StorePill({ name, color }: { name: string; color: string }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}20`, color }}>
      {name}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">
      {text}
    </div>
  );
}
