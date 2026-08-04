"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus, CheckCircle, Clock, Circle, Trash2, ChevronDown, ChevronUp,
  CalendarDays, StickyNote, Archive, BarChart3, Search, UserRound,
  CheckSquare, Square, XCircle,
} from "lucide-react";
import Toast from "@/components/Toast";
import { formatDate } from "@/lib/utils";
import { useSession } from "@/lib/session-context";

interface Store { id: number; short_name: string; color: string; }

interface Note {
  id: number;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed";
  priority: "low" | "normal" | "high";
  due_date: string | null;
  store_id: number | null;
  store_name: string | null;
  store_color: string | null;
  user_name: string | null;
  created_at: string;
  completed_at: string | null;
}

interface SummaryMonth {
  month_key: string;
  label: string;
  total: number;
  completed: number;
  in_progress: number;
  pending: number;
  high_priority: number;
  stores: { name: string; total: number }[];
  users: { name: string; total: number }[];
}

type ViewMode = "active" | "history" | "recap";
type SortKey = "newest" | "oldest" | "priority_high" | "priority_low" | "user_az" | "user_za";

const STATUS_MAP = {
  pending: { label: "Belum", icon: Circle, color: "text-gray-400", bg: "bg-gray-100" },
  in_progress: { label: "Proses", icon: Clock, color: "text-blue-600", bg: "bg-blue-100" },
  completed: { label: "Selesai", icon: CheckCircle, color: "text-green-600", bg: "bg-green-100" },
};

const PRIORITY_MAP = {
  low: { label: "Rendah", bg: "bg-gray-50", color: "text-gray-500" },
  normal: { label: "Normal", bg: "bg-blue-50", color: "text-blue-600" },
  high: { label: "Penting", bg: "bg-red-50", color: "text-red-600" },
};

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthInputLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };

export default function CatatanPage() {
  const { userRole } = useSession();
  const isOwner = userRole === "owner";
  const [notes, setNotes] = useState<Note[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [summary, setSummary] = useState<SummaryMonth[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("active");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editNote, setEditNote] = useState<Note | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", priority: "normal", due_date: "", store_id: "",
  });

  useEffect(() => {
    fetch("/api/stores").then((r) => r.ok ? r.json() : []).then(setStores).catch(() => setStores([]));
    fetch("/api/notes/summary")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setSummary(Array.isArray(data) ? data : []))
      .catch(() => setSummary([]));
  }, []);

  useEffect(() => {
    setLoadingNotes(true);
    const params = new URLSearchParams();
    if (viewMode === "history") {
      params.set("scope", "history");
      params.set("month", selectedMonth);
    } else {
      params.set("status", filterStatus);
    }

    fetch(`/api/notes?${params.toString()}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setNotes(Array.isArray(data) ? data : []); setLoadingNotes(false); })
      .catch(() => { setNotes([]); setLoadingNotes(false); });
  }, [filterStatus, selectedMonth, viewMode]);

  function refreshNotes() {
    const params = new URLSearchParams();
    if (viewMode === "history") {
      params.set("scope", "history");
      params.set("month", selectedMonth);
    } else {
      params.set("status", filterStatus);
    }

    Promise.all([
      fetch(`/api/notes?${params.toString()}`).then((r) => r.ok ? r.json() : []),
      fetch("/api/notes/summary").then((r) => r.ok ? r.json() : []),
    ]).then(([noteData, summaryData]) => {
      setNotes(Array.isArray(noteData) ? noteData : []);
      setSummary(Array.isArray(summaryData) ? summaryData : []);
    }).catch(() => {});
  }

  function resetForm() {
    setForm({ title: "", description: "", priority: "normal", due_date: "", store_id: "" });
    setShowForm(false);
    setEditNote(null);
  }

  function openNewForm() {
    setShowForm(true);
    setEditNote(null);
    setForm({ title: "", description: "", priority: "normal", due_date: "", store_id: "" });
  }

  function openEdit(note: Note) {
    setEditNote(note);
    setForm({
      title: note.title,
      description: note.description || "",
      priority: note.priority,
      due_date: note.due_date || "",
      store_id: note.store_id ? String(note.store_id) : "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setToast({ message: "Judul wajib diisi", type: "error" });
      return;
    }

    const body = { ...form, store_id: form.store_id ? Number(form.store_id) : null };
    const url = editNote ? `/api/notes/${editNote.id}` : "/api/notes";
    const method = editNote ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    if (res.ok) {
      setToast({ message: editNote ? "Catatan diperbarui" : "Catatan ditambahkan", type: "success" });
      resetForm();
      refreshNotes();
    } else {
      setToast({ message: "Gagal menyimpan catatan", type: "error" });
    }
  }

  function updateStatus(id: number, status: Note["status"]) {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, status } : n));
    fetch(`/api/notes/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
      .then(() => refreshNotes());
  }

  function handleDelete(id: number) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setDeleting(null);
    setToast({ message: "Catatan dihapus", type: "success" });
    fetch(`/api/notes/${id}`, { method: "DELETE" }).then(() => refreshNotes());
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(visibleNotes.map((n) => n.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);

    setNotes((prev) => prev.filter((n) => !selectedIds.has(n.id)));
    setSelectedIds(new Set());
    setToast({ message: `${ids.length} catatan dihapus`, type: "success" });

    await Promise.all(ids.map((id) => fetch(`/api/notes/${id}`, { method: "DELETE" })));
    refreshNotes();
    setBulkDeleting(false);
  }

  const visibleNotes = useMemo(() => {
    const term = search.toLowerCase().trim();
    let filtered = notes;
    if (term) {
      filtered = notes.filter((note) => [
        note.title,
        note.description || "",
        note.store_name || "",
        note.user_name || "",
      ].some((value) => value.toLowerCase().includes(term)));
    }

    const sorted = [...filtered];
    switch (sortBy) {
      case "oldest":
        sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
        break;
      case "newest":
        sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
        break;
      case "priority_high":
        sorted.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
        break;
      case "priority_low":
        sorted.sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
        break;
      case "user_az":
        sorted.sort((a, b) => (a.user_name || "").localeCompare(b.user_name || ""));
        break;
      case "user_za":
        sorted.sort((a, b) => (b.user_name || "").localeCompare(a.user_name || ""));
        break;
    }
    return sorted;
  }, [notes, search, sortBy]);

  const activeCounts = {
    all: notes.length,
    pending: notes.filter((n) => n.status === "pending").length,
    in_progress: notes.filter((n) => n.status === "in_progress").length,
    completed: notes.filter((n) => n.status === "completed").length,
  };

  const selectedSummary = summary.find((item) => item.month_key === selectedMonth);
  const selectionMode = selectedIds.size > 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Catatan Kerja</h2>
          <p className="text-sm text-gray-500">Pekerjaan harian, arsip selesai, dan rekap bulanan</p>
        </div>
        <button
          onClick={openNewForm}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" />
          Tambah
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-2 flex gap-1 overflow-x-auto">
        {[
          { key: "active", label: "Aktif", icon: StickyNote },
          { key: "history", label: "Histori Bulanan", icon: Archive },
          { key: "recap", label: "Rekap", icon: BarChart3 },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => { setViewMode(item.key as ViewMode); clearSelection(); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition ${
                viewMode === item.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 animate-slide-up">
          <h3 className="font-semibold text-gray-900 mb-4">{editNote ? "Edit Catatan" : "Catatan Baru"}</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Judul *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="contoh: Follow up stok produk dashboard"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Keterangan</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Detail pekerjaan, kendala, atau hasil yang perlu diingat..."
              />
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prioritas</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="low">Rendah</option>
                  <option value="normal">Normal</option>
                  <option value="high">Penting</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Target Selesai</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Toko</label>
                <select
                  value={form.store_id}
                  onChange={(e) => setForm({ ...form, store_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Umum</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.short_name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
                {editNote ? "Simpan" : "Tambah Catatan"}
              </button>
              <button onClick={resetForm} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition">Batal</button>
            </div>
          </div>
        </div>
      )}

      {viewMode === "recap" ? (
        <div className="space-y-3">
          {summary.length === 0 ? (
            <EmptyState text="Belum ada data rekap" />
          ) : (
            summary.map((month) => (
              <div key={month.month_key} className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{month.label}</h3>
                    <p className="text-xs text-gray-500">{month.completed} selesai dari {month.total} catatan</p>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <MiniStat label="Belum" value={month.pending} />
                    <MiniStat label="Proses" value={month.in_progress} />
                    <MiniStat label="Selesai" value={month.completed} />
                    <MiniStat label="Penting" value={month.high_priority} />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-3 mt-4">
                  <Breakdown title="Per Toko" rows={month.stores} />
                  <Breakdown title="Per User" rows={month.users} />
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 space-y-3">
            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Cari judul, toko, user, atau isi catatan..."
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="newest">Terbaru</option>
                <option value="oldest">Terlama</option>
                <option value="priority_high">Prioritas Tinggi</option>
                <option value="priority_low">Prioritas Rendah</option>
                {isOwner && <option value="user_az">User A-Z</option>}
                {isOwner && <option value="user_za">User Z-A</option>}
              </select>
              {viewMode === "history" && (
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>

            {viewMode === "active" ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                  { key: "all", label: "Semua" },
                  { key: "pending", label: "Belum" },
                  { key: "in_progress", label: "Proses" },
                  { key: "completed", label: "Selesai" },
                ].map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => setFilterStatus(filter.key)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition ${
                      filterStatus === filter.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {filter.label} ({activeCounts[filter.key as keyof typeof activeCounts] || 0})
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MiniStat label="Bulan" value={monthInputLabel(selectedMonth)} wide />
                <MiniStat label="Total" value={selectedSummary?.total || 0} />
                <MiniStat label="Selesai" value={selectedSummary?.completed || 0} />
                <MiniStat label="Penting" value={selectedSummary?.high_priority || 0} />
              </div>
            )}
          </div>

          {selectionMode && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between animate-slide-up">
              <span className="text-sm font-medium text-blue-800">{selectedIds.size} catatan dipilih</span>
              <div className="flex items-center gap-2">
                <button onClick={selectAll} className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1">Pilih Semua</button>
                <button onClick={clearSelection} className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Batal
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 disabled:opacity-50 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Hapus {selectedIds.size}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {loadingNotes ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-gray-400">Memuat catatan...</p>
              </div>
            ) : visibleNotes.length === 0 ? (
              <EmptyState text={viewMode === "history" ? "Belum ada catatan selesai pada bulan ini" : "Belum ada catatan"} />
            ) : (
              visibleNotes.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  expanded={expandedId === note.id}
                  deleting={deleting === note.id}
                  selected={selectedIds.has(note.id)}
                  selectionMode={selectionMode}
                  onToggleExpand={() => setExpandedId(expandedId === note.id ? null : note.id)}
                  onToggleSelect={() => toggleSelect(note.id)}
                  onCycleStatus={() => {
                    const next = note.status === "pending" ? "in_progress" : note.status === "in_progress" ? "completed" : "pending";
                    updateStatus(note.id, next);
                  }}
                  onComplete={() => updateStatus(note.id, "completed")}
                  onEdit={() => openEdit(note)}
                  onAskDelete={() => setDeleting(note.id)}
                  onCancelDelete={() => setDeleting(null)}
                  onDelete={() => handleDelete(note.id)}
                />
              ))
            )}
          </div>
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function NoteRow({
  note,
  expanded,
  deleting,
  selected,
  selectionMode,
  onToggleExpand,
  onToggleSelect,
  onCycleStatus,
  onComplete,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  note: Note;
  expanded: boolean;
  deleting: boolean;
  selected: boolean;
  selectionMode: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onCycleStatus: () => void;
  onComplete: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const statusCfg = STATUS_MAP[note.status];
  const priorityCfg = PRIORITY_MAP[note.priority];
  const StatusIcon = statusCfg.icon;
  const overdue = note.status !== "completed" && note.due_date && new Date(note.due_date) < new Date();

  return (
    <div className={`bg-white rounded-lg shadow-sm border transition ${selected ? "border-blue-300 bg-blue-50/30" : overdue ? "border-red-200" : "border-gray-100"}`}>
      <div
        className="flex items-start gap-3 p-4 cursor-pointer select-none"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          if (selectionMode) { onToggleSelect(); return; }
          onToggleExpand();
        }}
        onContextMenu={(e) => { e.preventDefault(); onToggleSelect(); }}
      >
        {selectionMode ? (
          <button onClick={(e) => { e.stopPropagation(); onToggleSelect(); }} className="mt-0.5 text-blue-600 hover:scale-110 transition-transform">
            {selected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-300" />}
          </button>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onCycleStatus(); }} className={`mt-0.5 ${statusCfg.color} hover:scale-110 transition-transform`}>
            <StatusIcon className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${note.status === "completed" ? "text-gray-400 line-through" : "text-gray-900"}`}>
              {note.title}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>{statusCfg.label}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${priorityCfg.bg} ${priorityCfg.color}`}>{priorityCfg.label}</span>
            {note.store_name && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: (note.store_color || "#64748b") + "20", color: note.store_color || undefined }}>
                {note.store_name}
              </span>
            )}
            {overdue && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">Terlambat</span>}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-400">
            {note.due_date && (
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {formatDate(note.due_date)}
              </span>
            )}
            {note.user_name && (
              <span className="flex items-center gap-1">
                <UserRound className="w-3 h-3" />
                {note.user_name}
              </span>
            )}
            {note.completed_at && <span>Selesai {note.completed_at.substring(0, 10)}</span>}
          </div>
        </div>
        <div className="p-1 text-gray-300">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-50 animate-fade-in">
          {note.description && <p className="text-sm text-gray-600 mb-3 mt-3 whitespace-pre-line">{note.description}</p>}
          <div className="flex flex-wrap gap-2 mt-3">
            {note.status !== "completed" && (
              <button onClick={onComplete} className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 text-xs font-medium rounded-md hover:bg-green-200 transition">
                <CheckCircle className="w-3.5 h-3.5" /> Selesai
              </button>
            )}
            <button onClick={onEdit} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-md hover:bg-gray-200 transition">Edit</button>
            {deleting ? (
              <div className="flex items-center gap-1">
                <button onClick={onDelete} className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-md">Hapus</button>
                <button onClick={onCancelDelete} className="px-3 py-1.5 bg-gray-200 text-gray-600 text-xs font-medium rounded-md">Batal</button>
              </div>
            ) : (
              <button onClick={onAskDelete} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-md hover:bg-red-100 transition">
                <Trash2 className="w-3.5 h-3.5" /> Hapus
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, wide }: { label: string; value: string | number; wide?: boolean }) {
  return (
    <div className={`bg-gray-50 rounded-md px-3 py-2 ${wide ? "col-span-2 md:col-span-1" : ""}`}>
      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-bold text-gray-900 truncate">{value}</div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { name: string | null; total: number }[] }) {
  return (
    <div className="bg-gray-50 rounded-md p-3">
      <div className="text-xs font-semibold text-gray-700 mb-2">{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-gray-400">Belum ada data</div>
      ) : (
        <div className="space-y-1">
          {rows.slice(0, 5).map((row) => (
            <div key={`${title}-${row.name}`} className="flex items-center justify-between text-xs">
              <span className="text-gray-500 truncate">{row.name || "Umum"}</span>
              <span className="font-semibold text-gray-900">{row.total}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
      <StickyNote className="w-10 h-10 text-gray-300 mx-auto mb-2" />
      <p className="text-gray-400">{text}</p>
    </div>
  );
}
