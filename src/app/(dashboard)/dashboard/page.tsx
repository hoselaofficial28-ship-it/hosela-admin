"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Package, Calendar, ArrowUpRight, ArrowDownRight, BarChart3, LineChartIcon, Layers } from "lucide-react";
import { formatDateShort } from "@/lib/utils";

interface Store {
  id: number;
  short_name: string;
  color: string;
  sort_order: number;
}

interface ShipmentRow {
  date: string;
  quantity: number;
  store_id: number;
  short_name: string;
  color: string;
}

interface Stats {
  total: number;
  avgPerDay: number;
  highestDay: { date: string; total: number } | null;
  lowestDay: { date: string; total: number } | null;
  changePercent: number | null;
}

const EMPTY_STATS: Stats = {
  total: 0,
  avgPerDay: 0,
  highestDay: null,
  lowestDay: null,
  changePercent: null,
};

type ChartType = "grouped" | "line" | "stacked";
type PeriodKey = "7d" | "30d" | "this_month" | "last_month" | "custom";

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "7d", label: "7 Hari" },
  { key: "30d", label: "30 Hari" },
  { key: "this_month", label: "Bulan Ini" },
  { key: "last_month", label: "Bulan Lalu" },
  { key: "custom", label: "Custom" },
];

function getDateRange(period: PeriodKey): { start: string; end: string; prevStart: string; prevEnd: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  switch (period) {
    case "7d": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      const prevEnd = new Date(start);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - 6);
      return { start: fmt(start), end: fmt(today), prevStart: fmt(prevStart), prevEnd: fmt(prevEnd) };
    }
    case "30d": {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      const prevEnd = new Date(start);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - 29);
      return { start: fmt(start), end: fmt(today), prevStart: fmt(prevStart), prevEnd: fmt(prevEnd) };
    }
    case "this_month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prevEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: fmt(start), end: fmt(today), prevStart: fmt(prevStart), prevEnd: fmt(prevEnd) };
    }
    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      const prevStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      const prevEnd = new Date(today.getFullYear(), today.getMonth() - 1, 0);
      return { start: fmt(start), end: fmt(end), prevStart: fmt(prevStart), prevEnd: fmt(prevEnd) };
    }
    default:
      return { start: fmt(today), end: fmt(today), prevStart: "", prevEnd: "" };
  }
}

export default function DashboardPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedStore, setSelectedStore] = useState<number | null>(null);
  const [chartType, setChartType] = useState<ChartType>("grouped");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const range = period === "custom"
      ? { start: customStart, end: customEnd, prevStart: "", prevEnd: "" }
      : getDateRange(period);

    if (!range.start || !range.end) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const storeParam = selectedStore ? `&store_id=${selectedStore}` : "";

    Promise.all([
      fetch("/api/stores").then((r) => r.ok ? r.json() : []),
      fetch(`/api/shipments?start=${range.start}&end=${range.end}${storeParam}`).then((r) => {
        if (!r.ok) throw new Error(r.status === 401 ? "unauthorized" : "forbidden");
        return r.json();
      }),
      fetch(`/api/stats?start=${range.start}&end=${range.end}&prev_start=${range.prevStart}&prev_end=${range.prevEnd}${storeParam}`).then((r) => {
        if (!r.ok) throw new Error(r.status === 401 ? "unauthorized" : "forbidden");
        return r.json();
      }),
    ])
      .then(([storeData, shipData, statsData]) => {
        setStores(Array.isArray(storeData) ? storeData : []);
        setShipments(Array.isArray(shipData) ? shipData : []);
        setStats({ ...EMPTY_STATS, ...statsData });
        setLoading(false);
      })
      .catch((err) => {
        setShipments([]);
        setStats(EMPTY_STATS);
        setError(err.message === "unauthorized"
          ? "Sesi kamu sudah berakhir. Silakan login ulang."
          : "Akun ini belum punya akses Dashboard.");
        setLoading(false);
      });
  }, [period, customStart, customEnd, selectedStore]);

  const chartData = useMemo(() => {
    const dateMap: Record<string, Record<string, number>> = {};
    for (const row of shipments) {
      if (!dateMap[row.date]) dateMap[row.date] = {};
      dateMap[row.date][row.short_name] = row.quantity;
    }
    return Object.entries(dateMap)
      .map(([date, vals]) => ({
        date,
        label: formatDateShort(date),
        ...vals,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [shipments]);

  const displayStores = selectedStore ? stores.filter((s) => s.id === selectedStore) : stores;

  const chartTypeIcons: Record<ChartType, React.ReactNode> = {
    grouped: <BarChart3 className="w-4 h-4" />,
    line: <LineChartIcon className="w-4 h-4" />,
    stacked: <Layers className="w-4 h-4" />,
  };

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-500">Ringkasan pengiriman toko</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPeriod(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                period === opt.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="flex gap-2">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedStore(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              !selectedStore ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Semua Toko
          </button>
          {stores.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedStore(s.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition border-2`}
              style={{
                backgroundColor: selectedStore === s.id ? s.color + "20" : undefined,
                borderColor: selectedStore === s.id ? s.color : "transparent",
                color: selectedStore === s.id ? s.color : "#6b7280",
              }}
            >
              {s.short_name}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 animate-pulse">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded bg-gray-200" />
                <div className="h-3 w-24 rounded bg-gray-200" />
              </div>
              <div className="h-7 w-16 rounded bg-gray-200 mb-2" />
              <div className="h-3 w-12 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Package className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />} label="Total Kirim" value={stats.total.toLocaleString("id-ID")} badge={stats.changePercent !== null ? { value: stats.changePercent, type: stats.changePercent >= 0 ? "up" : "down" } : undefined} />
          <StatCard icon={<Calendar className="w-4 h-4 md:w-5 md:h-5 text-purple-600" />} label="Rata-rata/Hari" value={stats.avgPerDay.toLocaleString("id-ID")} subtext="hari aktif" />
          <StatCard icon={<TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-green-600" />} label="Tertinggi" value={stats.highestDay ? stats.highestDay.total.toLocaleString("id-ID") : "-"} subtext={stats.highestDay ? formatDateShort(stats.highestDay.date) : ""} />
          <StatCard icon={<TrendingDown className="w-4 h-4 md:w-5 md:h-5 text-orange-600" />} label="Terendah" value={stats.lowestDay ? stats.lowestDay.total.toLocaleString("id-ID") : "-"} subtext={stats.lowestDay ? formatDateShort(stats.lowestDay.date) : ""} />
        </div>
      )}

      {/* Chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Grafik Pengiriman</h3>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {(["grouped", "line", "stacked"] as ChartType[]).map((t) => (
              <button
                key={t}
                onClick={() => setChartType(t)}
                className={`p-1.5 rounded-md transition ${chartType === t ? "bg-white shadow-sm" : "hover:bg-gray-200"}`}
                title={t === "grouped" ? "Bar Chart" : t === "line" ? "Line Chart" : "Stacked Bar"}
              >
                {chartTypeIcons[t]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-72 md:h-80 animate-pulse flex items-end gap-2 px-4 pb-4 pt-8">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="flex-1 flex gap-0.5 items-end">
                <div className="flex-1 bg-gray-200 rounded-t" style={{ height: `${20 + Math.random() * 60}%` }} />
                <div className="flex-1 bg-gray-100 rounded-t" style={{ height: `${20 + Math.random() * 60}%` }} />
              </div>
            ))}
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-400">Belum ada data untuk periode ini</div>
        ) : (
          <div className="h-72 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "line" ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                  <Legend />
                  {displayStores.map((s) => (
                    <Line key={s.id} type="monotone" dataKey={s.short_name} stroke={s.color} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  ))}
                </LineChart>
              ) : (
                <BarChart data={chartData} barGap={chartType === "stacked" ? 0 : 2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                  <Legend />
                  {displayStores.map((s) => (
                    <Bar key={s.id} dataKey={s.short_name} fill={s.color} stackId={chartType === "stacked" ? "stack" : undefined} radius={chartType === "stacked" ? 0 : [4, 4, 0, 0]} />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subtext, badge }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
  badge?: { value: number; type: "up" | "down" };
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 md:p-4 animate-slide-up">
      <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-2">
        {icon}
        <span className="text-[10px] md:text-xs font-medium text-gray-500 truncate">{label}</span>
      </div>
      <div className="text-xl md:text-2xl font-bold text-gray-900">{value}</div>
      <div className="flex items-center gap-1 mt-1">
        {badge && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${badge.type === "up" ? "text-green-600" : "text-red-600"}`}>
            {badge.type === "up" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(badge.value)}%
          </span>
        )}
        {subtext && <span className="text-[10px] md:text-xs text-gray-400">{subtext}</span>}
      </div>
    </div>
  );
}
