"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus, FlaskConical, ChevronDown, ChevronUp, Search,
  Trash2, CalendarDays, UserRound, Tag, DollarSign,
  Beaker, Lightbulb, Target, FileText, CheckCircle,
  Clock, Circle, Store,
} from "lucide-react";
import Toast from "@/components/Toast";
import { formatDate } from "@/lib/utils";
import { useSession } from "@/lib/session-context";

interface StoreItem { id: number; short_name: string; color: string; }

interface Riset {
  id: number;
  title: string;
  hypothesis: string | null;
  method: string | null;
  result: string | null;
  conclusion: string | null;
  status: "planning" | "running" | "completed";
  category: string;
  store_id: number | null;
  store_name: string | null;
  store_color: string | null;
  cost: string | null;
  start_date: string | null;
  end_date: string | null;
  tags: string | null;
  user_name: string | null;
  created_at: string;
}

const STATUS_MAP = {
  planning: { label: "Rencana", icon: Circle, color: "text-gray-400", bg: "bg-gray-100" },
  running: { label: "Berjalan", icon: Clock, color: "text-blue-600", bg: "bg-blue-100" },
  completed: { label: "Selesai", icon: CheckCircle, color: "text-green-600", bg: "bg-green-100" },
};

const CATEGORY_MAP: Record<string, { label: string; bg: string; color: string }> = {
  ads: { label: "Ads", bg: "bg-purple-50", color: "text-purple-600" },
  pricing: { label: "Pricing", bg: "bg-amber-50", color: "text-amber-600" },
  product: { label: "Produk", bg: "bg-blue-50", color: "text-blue-600" },
  marketplace: { label: "Marketplace", bg: "bg-green-50", color: "text-green-600" },
  content: { label: "Konten", bg: "bg-pink-50", color: "text-pink-600" },
  other: { label: "Lainnya", bg: "bg-gray-50", color: "text-gray-500" },
};

export default function LabRisetPage() {
  const { userRole, userName } = useSession();
  const isOwner = userRole === "owner";
  const [items, setItems] = useState<Riset[]>([]);
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterUser, setFilterUser] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Riset | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "", hypothesis: "", method: "", result: "", conclusion: "",
    status: "planning", category: "other", store_id: "", cost: "",
    start_date: "", end_date: "", tags: "",
  });

  useEffect(() => {
    fetch("/api/stores").then((r) => r.ok ? r.json() : []).then(setStores).catch(() => setStores([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterCategory !== "all") params.set("category", filterCategory);

    fetch(`/api/lab-riset?${params.toString()}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setItems(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setItems([]); setLoading(false); });
  }, [filterStatus, filterCategory]);

  function refreshItems() {
    const params = new URLSearchParams();
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterCategory !== "all") params.set("category", filterCategory);

    fetch(`/api/lab-riset?${params.toString()}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => {});
  }

  function resetForm() {
    setForm({ title: "", hypothesis: "", method: "", result: "", conclusion: "", status: "planning", category: "other", store_id: "", cost: "", start_date: "", end_date: "", tags: "" });
    setShowForm(false);
    setEditItem(null);
  }

  function openNewForm() {
    setShowForm(true);
    setEditItem(null);
    setForm({ title: "", hypothesis: "", method: "", result: "", conclusion: "", status: "planning", category: "other", store_id: "", cost: "", start_date: "", end_date: "", tags: "" });
  }

  function openEdit(item: Riset) {
    setEditItem(item);
    setForm({
      title: item.title,
      hypothesis: item.hypothesis || "",
      method: item.method || "",
      result: item.result || "",
      conclusion: item.conclusion || "",
      status: item.status,
      category: item.category,
      store_id: item.store_id ? String(item.store_id) : "",
      cost: item.cost || "",
      start_date: item.start_date || "",
      end_date: item.end_date || "",
      tags: item.tags || "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setToast({ message: "Judul riset wajib diisi", type: "error" });
      return;
    }
    if (saving) return;
    setSaving(true);

    try {
      const body = { ...form, store_id: form.store_id ? Number(form.store_id) : null };
      const url = editItem ? `/api/lab-riset/${editItem.id}` : "/api/lab-riset";
      const method = editItem ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

      if (res.ok) {
        setToast({ message: editItem ? "Riset diperbarui" : "Riset baru ditambahkan", type: "success" });
        resetForm();
        refreshItems();
      } else {
        setToast({ message: "Gagal menyimpan", type: "error" });
      }
    } finally {
      setSaving(false);
    }
  }

  function updateStatus(id: number, status: Riset["status"]) {
    setItems((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
    fetch(`/api/lab-riset/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
      .then(() => refreshItems());
  }

  function handleDelete(id: number) {
    setItems((prev) => prev.filter((r) => r.id !== id));
    setDeleting(null);
    setToast({ message: "Riset dihapus", type: "success" });
    fetch(`/api/lab-riset/${id}`, { method: "DELETE" }).then(() => refreshItems());
  }

  const uniqueUsers = useMemo(() => {
    const names = new Set<string>();
    items.forEach((r) => { if (r.user_name) names.add(r.user_name); });
    return Array.from(names).sort();
  }, [items]);

  const visibleItems = useMemo(() => {
    let filtered = items;
    if (filterUser === "__me__") {
      filtered = filtered.filter((r) => r.user_name === userName);
    } else if (filterUser) {
      filtered = filtered.filter((r) => r.user_name === filterUser);
    }

    const term = search.toLowerCase().trim();
    if (term) {
      filtered = filtered.filter((r) => [
        r.title, r.hypothesis || "", r.method || "", r.result || "",
        r.conclusion || "", r.tags || "", r.store_name || "", r.user_name || "",
      ].some((v) => v.toLowerCase().includes(term)));
    }
    return filtered;
  }, [items, search, filterUser, userName]);

  const counts = useMemo(() => ({
    all: items.length,
    planning: items.filter((r) => r.status === "planning").length,
    running: items.filter((r) => r.status === "running").length,
    completed: items.filter((r) => r.status === "completed").length,
  }), [items]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Lab Riset</h2>
          <p className="text-sm text-gray-500">Catat strategi, eksperimen, dan hasilnya agar tidak hilang</p>
        </div>
        <button
          onClick={openNewForm}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" />
          Riset Baru
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 animate-slide-up">
          <h3 className="font-semibold text-gray-900 mb-4">{editItem ? "Edit Riset" : "Riset Baru"}</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Judul Riset *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="contoh: Test harga naik 10% di Shopee selama 1 minggu"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <span className="flex items-center gap-1"><Target className="w-3 h-3" /> Hipotesis</span>
              </label>
              <textarea
                value={form.hypothesis}
                onChange={(e) => setForm({ ...form, hypothesis: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Apa yang ingin dibuktikan? contoh: Kenaikan harga 10% tidak menurunkan penjualan lebih dari 5%"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <span className="flex items-center gap-1"><Beaker className="w-3 h-3" /> Cara / Metode</span>
              </label>
              <textarea
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Langkah-langkah yang dilakukan..."
              />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> Hasil</span>
                </label>
                <textarea
                  value={form.result}
                  onChange={(e) => setForm({ ...form, result: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Data atau reaksi pasar yang didapat..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <span className="flex items-center gap-1"><Lightbulb className="w-3 h-3" /> Kesimpulan</span>
                </label>
                <textarea
                  value={form.conclusion}
                  onChange={(e) => setForm({ ...form, conclusion: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Pelajaran yang didapat dari riset ini..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="planning">Rencana</option>
                  <option value="running">Berjalan</option>
                  <option value="completed">Selesai</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kategori</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {Object.entries(CATEGORY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Toko</label>
                <select value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">Umum</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.short_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Biaya</label>
                <input type="text" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="contoh: Rp 500rb" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mulai</label>
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Selesai</label>
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Tags</label>
                <input type="text" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="pisahkan dengan koma, contoh: shopee, harga, promo" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition flex items-center gap-2"
              >
                {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {saving ? "Menyimpan..." : editItem ? "Simpan" : "Tambah Riset"}
              </button>
              <button onClick={resetForm} disabled={saving} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 disabled:opacity-60 transition">Batal</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Cari riset, hipotesis, hasil..."
            />
          </div>
          {isOwner && uniqueUsers.length > 1 && (
            <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Semua User</option>
              <option value="__me__">Saya</option>
              {uniqueUsers.filter((u) => u !== userName).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="all">Semua Kategori</option>
            {Object.entries(CATEGORY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: "all", label: "Semua" },
            { key: "planning", label: "Rencana" },
            { key: "running", label: "Berjalan" },
            { key: "completed", label: "Selesai" },
          ].map((filter) => (
            <button
              key={filter.key}
              onClick={() => setFilterStatus(filter.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition ${
                filterStatus === filter.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {filter.label} ({counts[filter.key as keyof typeof counts] || 0})
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-gray-400">Memuat data riset...</p>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
            <FlaskConical className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400">Belum ada riset</p>
          </div>
        ) : (
          visibleItems.map((item) => (
            <RisetCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              deleting={deleting === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onCycleStatus={() => {
                const next = item.status === "planning" ? "running" : item.status === "running" ? "completed" : "planning";
                updateStatus(item.id, next);
              }}
              onEdit={() => openEdit(item)}
              onAskDelete={() => setDeleting(item.id)}
              onCancelDelete={() => setDeleting(null)}
              onDelete={() => handleDelete(item.id)}
            />
          ))
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function RisetCard({
  item, expanded, deleting, onToggle, onCycleStatus, onEdit, onAskDelete, onCancelDelete, onDelete,
}: {
  item: Riset; expanded: boolean; deleting: boolean;
  onToggle: () => void; onCycleStatus: () => void; onEdit: () => void;
  onAskDelete: () => void; onCancelDelete: () => void; onDelete: () => void;
}) {
  const statusCfg = STATUS_MAP[item.status];
  const categoryCfg = CATEGORY_MAP[item.category] || CATEGORY_MAP.other;
  const StatusIcon = statusCfg.icon;
  const tags = item.tags ? item.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 transition">
      <div
        className="flex items-start gap-3 p-4 cursor-pointer select-none"
        onClick={(e) => { if ((e.target as HTMLElement).closest("button")) return; onToggle(); }}
      >
        <button onClick={(e) => { e.stopPropagation(); onCycleStatus(); }} className={`mt-0.5 ${statusCfg.color} hover:scale-110 transition-transform`}>
          <StatusIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${item.status === "completed" ? "text-gray-400" : "text-gray-900"}`}>{item.title}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>{statusCfg.label}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${categoryCfg.bg} ${categoryCfg.color}`}>{categoryCfg.label}</span>
            {item.store_name && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: (item.store_color || "#64748b") + "20", color: item.store_color || undefined }}>
                {item.store_name}
              </span>
            )}
          </div>
          {item.hypothesis && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-1">{item.hypothesis}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-400">
            {item.start_date && (
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {formatDate(item.start_date)}{item.end_date ? ` — ${formatDate(item.end_date)}` : ""}
              </span>
            )}
            {item.cost && (
              <span className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                {item.cost}
              </span>
            )}
            {item.user_name && (
              <span className="flex items-center gap-1">
                <UserRound className="w-3 h-3" />
                {item.user_name}
              </span>
            )}
            {tags.length > 0 && (
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {tags.slice(0, 3).join(", ")}
              </span>
            )}
          </div>
        </div>
        <div className="p-1 text-gray-300">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-50 animate-fade-in">
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            {item.hypothesis && (
              <Section icon={Target} label="Hipotesis" text={item.hypothesis} />
            )}
            {item.method && (
              <Section icon={Beaker} label="Cara / Metode" text={item.method} />
            )}
            {item.result && (
              <Section icon={FileText} label="Hasil" text={item.result} />
            )}
            {item.conclusion && (
              <Section icon={Lightbulb} label="Kesimpulan" text={item.conclusion} />
            )}
          </div>

          {(item.cost || item.store_name) && (
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
              {item.cost && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> Biaya: {item.cost}</span>}
              {item.store_name && <span className="flex items-center gap-1"><Store className="w-3 h-3" /> {item.store_name}</span>}
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
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

function Section({ icon: Icon, label, text }: { icon: React.ComponentType<{ className?: string }>; label: string; text: string }) {
  return (
    <div className="bg-gray-50 rounded-md p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className="text-sm text-gray-600 whitespace-pre-line">{text}</p>
    </div>
  );
}
