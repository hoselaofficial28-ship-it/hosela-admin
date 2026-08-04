"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, ChevronDown, ChevronUp, Calendar, Trash2,
  Download, Upload, FileSpreadsheet,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import Toast from "@/components/Toast";

interface Store {
  id: number;
  short_name: string;
  color: string;
}

interface ShipmentRow {
  date: string;
  quantity: number;
  store_id: number;
  short_name: string;
}

interface DayRow {
  date: string;
  [key: string]: string | number;
  total: number;
}

interface MonthGroup {
  key: string;
  label: string;
  rows: DayRow[];
  totals: Record<string, number>;
  activeDays: number;
}

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function getCurrentMonthSet() {
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return new Set([currentKey]);
}

export default function HistoryPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(getCurrentMonthSet);
  const [userRole, setUserRole] = useState<string>("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);
  const [deletingMonth, setDeletingMonth] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.user?.role) setUserRole(data.user.role); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/stores").then((r) => r.ok ? r.json() : []).then((data) => setStores(Array.isArray(data) ? data : [])).catch(() => setStores([]));
  }, []);

  useEffect(() => {
    loadShipments();
  }, []);

  function loadShipments() {
    setLoading(true);
    fetch("/api/shipments?")
      .then((res) => res.ok ? res.json() : [])
      .then((data) => { setShipments(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setShipments([]); setLoading(false); });
  }

  const monthGroups = useMemo(() => {
    const dateMap: Record<string, Record<string, number>> = {};
    for (const row of shipments) {
      if (!dateMap[row.date]) dateMap[row.date] = {};
      dateMap[row.date][row.short_name] = row.quantity;
    }

    let allRows = Object.entries(dateMap).map(([date, vals]) => {
      const total = Object.values(vals).reduce((s, v) => s + v, 0);
      return { date, ...vals, total } as DayRow;
    });

    if (search) {
      allRows = allRows.filter((r) => formatDate(r.date).toLowerCase().includes(search.toLowerCase()));
    }

    allRows.sort((a, b) => b.date.localeCompare(a.date));

    const grouped: Record<string, DayRow[]> = {};
    for (const row of allRows) {
      const monthKey = row.date.substring(0, 7);
      if (!grouped[monthKey]) grouped[monthKey] = [];
      grouped[monthKey].push(row);
    }

    const result: MonthGroup[] = Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, rows]) => {
        const [year, month] = key.split("-").map(Number);
        const label = `${MONTH_NAMES[month - 1]} ${year}`;

        const totals: Record<string, number> = { total: 0 };
        for (const s of stores) totals[s.short_name] = 0;
        for (const row of rows) {
          for (const s of stores) {
            const val = (row[s.short_name] as number) || 0;
            totals[s.short_name] += val;
          }
          totals.total += row.total;
        }

        const activeDays = rows.filter((r) => r.total > 0).length;

        return { key, label, rows, totals, activeDays };
      });

    return result;
  }, [shipments, search, stores]);

  const grandTotals = useMemo(() => {
    const result: Record<string, number> = { total: 0 };
    for (const s of stores) result[s.short_name] = 0;
    for (const mg of monthGroups) {
      for (const s of stores) result[s.short_name] += mg.totals[s.short_name] || 0;
      result.total += mg.totals.total;
    }
    return result;
  }, [monthGroups, stores]);

  function toggleMonth(key: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function expandAll() { setExpandedMonths(new Set(monthGroups.map((m) => m.key))); }
  function collapseAll() { setExpandedMonths(new Set()); }

  const isOwner = userRole === "owner";

  function handleDeleteRow(date: string) {
    setShipments((prev) => prev.filter((s) => s.date !== date));
    setDeletingDate(null);
    setToast({ message: `Data ${formatDate(date)} dihapus`, type: "success" });
    fetch("/api/shipments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    }).then(() => loadShipments());
  }

  function handleDeleteMonth(monthKey: string, label: string) {
    setShipments((prev) => prev.filter((s) => !s.date.startsWith(monthKey)));
    setDeletingMonth(null);
    setToast({ message: `Riwayat ${label} dihapus`, type: "success" });
    fetch("/api/shipments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: monthKey }),
    }).then(() => loadShipments());
  }

  function exportToCSV() {
    if (stores.length === 0 || shipments.length === 0) return;

    const storeNames = stores.map((s) => s.short_name);
    const header = ["Tanggal", ...storeNames, "Total"].join(",");

    const dateMap: Record<string, Record<string, number>> = {};
    for (const row of shipments) {
      if (!dateMap[row.date]) dateMap[row.date] = {};
      dateMap[row.date][row.short_name] = row.quantity;
    }

    const sortedDates = Object.keys(dateMap).sort();
    const csvRows = sortedDates.map((date) => {
      const vals = storeNames.map((name) => dateMap[date][name] || 0);
      const total = vals.reduce((s, v) => s + v, 0);
      return [date, ...vals, total].join(",");
    });

    const csv = "﻿" + [header, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `riwayat-pengiriman-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ message: "Data berhasil diekspor", type: "success" });
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    try {
      const text = await file.text();
      const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error("File kosong atau format tidak sesuai");

      const headerCols = lines[0].split(",").map((c) => c.trim());
      const storeNames = headerCols.slice(1, -1);

      const storeIdMap: Record<string, number> = {};
      for (const store of stores) {
        storeIdMap[store.short_name] = store.id;
      }

      const unmatchedStores = storeNames.filter((n) => !storeIdMap[n]);
      if (unmatchedStores.length > 0) {
        throw new Error(`Toko tidak ditemukan: ${unmatchedStores.join(", ")}. Pastikan nama toko sesuai dengan yang ada di sistem.`);
      }

      let importCount = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        const date = cols[0];
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

        const shipmentsList = storeNames.map((name, idx) => ({
          store_id: storeIdMap[name],
          quantity: Math.max(0, parseInt(cols[idx + 1]) || 0),
        })).filter((s) => s.store_id);

        if (shipmentsList.length === 0) continue;

        await fetch("/api/shipments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, shipments: shipmentsList }),
        });
        importCount++;
      }

      setToast({ message: `${importCount} baris data berhasil diimpor`, type: "success" });
      loadShipments();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Gagal mengimpor data", type: "error" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Riwayat Pengiriman</h2>
          <p className="text-sm text-gray-500">Data pengiriman harian semua toko</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportToCSV}
            disabled={shipments.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 transition"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={handleImportClick}
            disabled={importing}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition"
          >
            <Upload className="w-4 h-4" />
            {importing ? "Mengimpor..." : "Import"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Cari tanggal..."
            />
          </div>
          <div className="flex gap-2">
            <button onClick={expandAll} className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-xl hover:bg-gray-200 transition">Buka Semua</button>
            <button onClick={collapseAll} className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-xl hover:bg-gray-200 transition">Tutup Semua</button>
          </div>
        </div>
      </div>

      {importing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <FileSpreadsheet className="w-5 h-5 text-blue-600 animate-pulse" />
          <span className="text-sm text-blue-800">Mengimpor data dari file CSV...</span>
        </div>
      )}

      {!loading && monthGroups.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Keseluruhan</h3>
          <div className="flex flex-wrap gap-4">
            {stores.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-sm text-gray-600">{s.short_name}:</span>
                <span className="text-sm font-bold" style={{ color: s.color }}>{(grandTotals[s.short_name] || 0).toLocaleString("id-ID")}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-gray-600">Total:</span>
              <span className="text-lg font-bold text-gray-900">{grandTotals.total.toLocaleString("id-ID")}</span>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">Memuat data...</div>
      ) : monthGroups.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">Belum ada data</div>
      ) : (
        monthGroups.map((mg) => {
          const expanded = expandedMonths.has(mg.key);
          const avgPerDay = mg.activeDays > 0 ? Math.round(mg.totals.total / mg.activeDays) : 0;

          return (
            <div key={mg.key} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center">
                <button
                  onClick={() => toggleMonth(mg.key)}
                  className="flex-1 flex items-center justify-between p-4 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-gray-900">{mg.label}</h3>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{mg.activeDays} hari aktif</span>
                        <span>|</span>
                        <span>Rata-rata {avgPerDay}/hari</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-3">
                      {stores.map((s) => (
                        <span key={s.id} className="text-xs font-medium tabular-nums" style={{ color: s.color }}>
                          {(mg.totals[s.short_name] || 0).toLocaleString("id-ID")}
                        </span>
                      ))}
                    </div>
                    <span className="text-lg font-bold text-gray-900 tabular-nums">{mg.totals.total.toLocaleString("id-ID")}</span>
                    {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>
                </button>
                {isOwner && (
                  <div className="pr-4 shrink-0">
                    {deletingMonth === mg.key ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleDeleteMonth(mg.key, mg.label)} className="px-2.5 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition">Hapus</button>
                        <button onClick={() => setDeletingMonth(null)} className="px-2.5 py-1.5 bg-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-300 transition">Batal</button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingMonth(mg.key); }}
                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                        title={`Hapus riwayat ${mg.label}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {expanded && (
                <div className="border-t border-gray-100">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50/80">
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Tanggal</th>
                          {stores.map((s) => (
                            <th key={s.id} className="text-right px-4 py-2.5 text-xs font-medium" style={{ color: s.color }}>{s.short_name}</th>
                          ))}
                          <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-700">Total</th>
                          {isOwner && <th className="w-10 px-2 py-2.5"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {mg.rows.map((row) => (
                          <tr key={row.date} className="border-t border-gray-50 hover:bg-gray-50/50 transition group">
                            <td className="px-4 py-2 text-gray-700 font-medium">{formatDate(row.date)}</td>
                            {stores.map((s) => (
                              <td key={s.id} className="px-4 py-2 text-right text-gray-600 tabular-nums">
                                {(row[s.short_name] as number) || 0}
                              </td>
                            ))}
                            <td className="px-4 py-2 text-right font-semibold text-gray-900 tabular-nums">{row.total}</td>
                            {isOwner && (
                              <td className="px-2 py-2">
                                {deletingDate === row.date ? (
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => handleDeleteRow(row.date)} className="px-2 py-1 bg-red-600 text-white text-xs rounded">Ya</button>
                                    <button onClick={() => setDeletingDate(null)} className="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded">Batal</button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeletingDate(row.date)}
                                    className="p-1 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
                                    title="Hapus baris ini"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                        <tr className="bg-blue-50/50 border-t-2 border-blue-100 font-semibold">
                          <td className="px-4 py-2.5 text-gray-700">Total {mg.label}</td>
                          {stores.map((s) => (
                            <td key={s.id} className="px-4 py-2.5 text-right tabular-nums" style={{ color: s.color }}>
                              {(mg.totals[s.short_name] || 0).toLocaleString("id-ID")}
                            </td>
                          ))}
                          <td className="px-4 py-2.5 text-right text-gray-900 tabular-nums">{mg.totals.total.toLocaleString("id-ID")}</td>
                          {isOwner && <td></td>}
                        </tr>
                        <tr className="bg-blue-50/30 font-medium">
                          <td className="px-4 py-2.5 text-gray-500">Rata-rata/hari</td>
                          {stores.map((s) => (
                            <td key={s.id} className="px-4 py-2.5 text-right text-gray-400 tabular-nums">
                              {mg.activeDays > 0 ? Math.round((mg.totals[s.short_name] || 0) / mg.activeDays) : 0}
                            </td>
                          ))}
                          <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{avgPerDay}</td>
                          {isOwner && <td></td>}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
