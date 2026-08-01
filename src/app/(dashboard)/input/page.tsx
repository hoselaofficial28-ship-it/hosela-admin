"use client";

import { useState, useEffect } from "react";
import { Calculator, CalendarDays, Save, Sun, Sunset } from "lucide-react";
import Toast from "@/components/Toast";

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

export default function InputPage() {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [stores, setStores] = useState<Store[]>([]);
  const [quantities, setQuantities] = useState<Record<number, SessionQuantity>>({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isExisting, setIsExisting] = useState(false);

  useEffect(() => {
    fetch("/api/stores").then((r) => r.ok ? r.json() : []).then((d) => setStores(Array.isArray(d) ? d : [])).catch(() => setStores([]));
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

  async function handleSave() {
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

  const dayName = new Date(date + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long" });
  const isSunday = new Date(date + "T00:00:00").getDay() === 0;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto animate-fade-in">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Input Resi Harian</h2>
      <p className="text-sm text-gray-500 mb-6">Catat resi sesi pagi dan siang/sore, total dihitung otomatis</p>

      {/* Date Picker */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
          <CalendarDays className="w-4 h-4" />
          Tanggal
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
        />
        <div className="flex items-center gap-2 mt-2">
          <span className="text-sm text-gray-500">{dayName}</span>
          {isSunday && (
            <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">Hari Minggu (Libur)</span>
          )}
          {isExisting && (
            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Data sudah ada</span>
          )}
        </div>
      </div>

      {/* Store Inputs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
        <div className="hidden md:grid grid-cols-[1.4fr_1fr_1fr_.8fr] gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <span>Toko</span>
          <span className="flex items-center gap-1.5"><Sun className="w-3.5 h-3.5" /> Sesi Pagi</span>
          <span className="flex items-center gap-1.5"><Sunset className="w-3.5 h-3.5" /> Sesi Siang/Sore</span>
          <span className="text-right">Total</span>
        </div>

        <div className="divide-y divide-gray-100">
          {stores.map((store) => (
            <div key={store.id} className="p-4 md:grid md:grid-cols-[1.4fr_1fr_1fr_.8fr] md:items-center md:gap-3">
              <div className="flex items-center gap-2 mb-3 md:mb-0">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: store.color }} />
                <div>
                  <div className="text-sm font-semibold text-gray-900">{store.short_name}</div>
                  <div className="text-xs text-gray-400 md:hidden">Input sesi pagi dan siang/sore</div>
                </div>
              </div>

              <label className="block mb-3 md:mb-0">
                <span className="md:hidden flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                  <Sun className="w-3.5 h-3.5" /> Sesi Pagi
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={quantities[store.id]?.morning || ""}
                  onChange={(e) => updateQuantity(store.id, "morning", e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:border-transparent outline-none transition text-lg font-semibold text-gray-900"
                  style={{ ["--tw-ring-color" as string]: store.color }}
                  placeholder="0"
                />
              </label>

              <label className="block mb-3 md:mb-0">
                <span className="md:hidden flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                  <Sunset className="w-3.5 h-3.5" /> Sesi Siang/Sore
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={quantities[store.id]?.afternoon || ""}
                  onChange={(e) => updateQuantity(store.id, "afternoon", e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:border-transparent outline-none transition text-lg font-semibold text-gray-900"
                  style={{ ["--tw-ring-color" as string]: store.color }}
                  placeholder="0"
                />
              </label>

              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5 md:justify-end md:bg-transparent md:px-0">
                <span className="md:hidden text-sm font-medium text-gray-500">Total</span>
                <span className="text-xl font-bold text-gray-900">{getStoreTotal(store.id)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 bg-gray-50 px-4 py-3 border-t border-gray-100">
          <div>
            <div className="text-xs text-gray-500">Total Pagi</div>
            <div className="text-lg font-bold text-gray-900">{morningTotal}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Total Siang/Sore</div>
            <div className="text-lg font-bold text-gray-900">{afternoonTotal}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Grand Total</div>
            <div className="text-lg font-bold text-blue-700">{total}</div>
          </div>
        </div>
      </div>

      {/* Total & Save */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="flex items-center gap-2 text-sm font-medium text-gray-500">
            <Calculator className="w-4 h-4" />
            Total Pengiriman Otomatis
          </span>
          <span className="text-2xl font-bold text-gray-900">{total}</span>
        </div>

        <button
          onClick={handleSave}
          disabled={loading || total === 0}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 transition"
        >
          <Save className="w-4 h-4" />
          {loading ? "Menyimpan..." : isExisting ? "Perbarui Data" : "Simpan Data"}
        </button>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
