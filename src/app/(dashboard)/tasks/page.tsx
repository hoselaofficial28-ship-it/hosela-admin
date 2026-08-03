"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, CheckCircle, Clock, AlertCircle, Circle, Trash2,
  ChevronDown, ChevronUp, Flag, CalendarClock, Bell, Search,
} from "lucide-react";
import Toast from "@/components/Toast";
import { formatDate } from "@/lib/utils";

interface Store {
  id: number;
  short_name: string;
  color: string;
}

interface AppUser {
  id: number;
  name: string;
  username: string;
  role: string;
}

interface Task {
  id: number;
  title: string;
  description: string | null;
  assigned_to: string | null;
  status: "pending" | "in_progress" | "completed";
  priority: "low" | "normal" | "high" | "urgent";
  deadline: string | null;
  reminder_at: string | null;
  store_id: number | null;
  store_name: string | null;
  store_color: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

const STATUS_CONFIG = {
  pending: { label: "Belum Dikerjakan", icon: Circle, color: "text-gray-400", bg: "bg-gray-100" },
  in_progress: { label: "Sedang Dikerjakan", icon: Clock, color: "text-blue-600", bg: "bg-blue-100" },
  completed: { label: "Selesai", icon: CheckCircle, color: "text-green-600", bg: "bg-green-100" },
};

const PRIORITY_CONFIG = {
  low: { label: "Rendah", color: "text-gray-400", bg: "bg-gray-50", border: "border-gray-200" },
  normal: { label: "Normal", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  high: { label: "Tinggi", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
  urgent: { label: "Mendesak", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    assigned_to: "",
    priority: "normal",
    deadline: "",
    reminder_at: "",
    store_id: "",
  });

  const loadTasks = useCallback(async () => {
    setLoadingTasks(true);
    const res = await fetch(`/api/tasks?status=${filterStatus}`);
    const data = res.ok ? await res.json() : [];
    setTasks(Array.isArray(data) ? data : []);
    setLoadingTasks(false);
  }, [filterStatus]);

  useEffect(() => { fetch("/api/stores").then((r) => r.ok ? r.json() : []).then((d) => setStores(Array.isArray(d) ? d : [])).catch(() => setStores([])); }, []);
  useEffect(() => { fetch("/api/users/list").then((r) => r.ok ? r.json() : []).then((d) => setAllUsers(Array.isArray(d) ? d : [])).catch(() => setAllUsers([])); }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) setShowUserDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => {
    Promise.resolve().then(loadTasks);
  }, [loadTasks]);

  function resetForm() {
    setForm({ title: "", description: "", assigned_to: "", priority: "normal", deadline: "", reminder_at: "", store_id: "" });
    setShowForm(false);
    setEditTask(null);
  }

  function openEdit(task: Task) {
    setEditTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      assigned_to: task.assigned_to || "",
      priority: task.priority,
      deadline: task.deadline || "",
      reminder_at: task.reminder_at || "",
      store_id: task.store_id ? String(task.store_id) : "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title) { setToast({ message: "Judul tugas wajib diisi", type: "error" }); return; }
    if (saving) return;
    setSaving(true);

    const body = {
      ...form,
      store_id: form.store_id ? Number(form.store_id) : null,
    };

    const url = editTask ? `/api/tasks/${editTask.id}` : "/api/tasks";
    const method = editTask ? "PUT" : "POST";

    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) {
      setToast({ message: editTask ? "Tugas diperbarui" : "Tugas berhasil dibuat", type: "success" });
      resetForm();
      loadTasks();
    } else {
      const data = await res.json();
      setToast({ message: data.error, type: "error" });
    }
  }

  async function updateStatus(id: number, status: string) {
    await fetch(`/api/tasks/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    loadTasks();
    setToast({ message: status === "completed" ? "Tugas selesai!" : "Status diperbarui", type: "success" });
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (res.ok) {
      setToast({ message: "Tugas dihapus", type: "success" });
      setDeleting(null);
      loadTasks();
    }
  }

  function isOverdue(deadline: string | null) {
    if (!deadline) return false;
    return new Date(deadline) < new Date() ;
  }

  const statusCounts = {
    all: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Tugas</h2>
          <p className="text-sm text-gray-500">Kelola tugas dan perintah kerja</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditTask(null); setForm({ title: "", description: "", assigned_to: "", priority: "normal", deadline: "", reminder_at: "", store_id: "" }); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" />
          Tugas Baru
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4 animate-slide-up">
          <h3 className="font-semibold text-gray-900 mb-4">{editTask ? "Edit Tugas" : "Buat Tugas Baru"}</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Judul Tugas *</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="contoh: Upload foto produk baru" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Deskripsi</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Detail tugas..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div ref={userDropdownRef} className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">Ditugaskan Ke</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={showUserDropdown ? userSearch : form.assigned_to}
                    onChange={(e) => { setUserSearch(e.target.value); setShowUserDropdown(true); }}
                    onFocus={() => { setUserSearch(""); setShowUserDropdown(true); }}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Cari user..."
                    autoComplete="off"
                  />
                </div>
                {showUserDropdown && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 max-h-48 overflow-y-auto">
                    {allUsers.filter((u) => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.username.toLowerCase().includes(userSearch.toLowerCase())).length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-400">Tidak ditemukan</div>
                    ) : (
                      allUsers.filter((u) => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.username.toLowerCase().includes(userSearch.toLowerCase())).map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => { setForm({ ...form, assigned_to: u.name }); setShowUserDropdown(false); setUserSearch(""); }}
                          className={`flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-gray-50 transition ${form.assigned_to === u.name ? "bg-blue-50" : ""}`}
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ${form.assigned_to === u.name ? "bg-blue-200 text-blue-700" : "bg-gray-200 text-gray-600"}`}>
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm text-gray-900 truncate">{u.name}</div>
                            <div className="text-[10px] text-gray-400">{u.role === "owner" ? "Owner" : u.username}</div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prioritas</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="low">Rendah</option>
                  <option value="normal">Normal</option>
                  <option value="high">Tinggi</option>
                  <option value="urgent">Mendesak</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Deadline</label>
                <input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pengingat</label>
                <input type="datetime-local" value={form.reminder_at} onChange={(e) => setForm({ ...form, reminder_at: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Toko Terkait</label>
              <select value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">— Umum —</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.short_name}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
                {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {saving ? "Menyimpan..." : editTask ? "Simpan" : "Buat Tugas"}
              </button>
              <button onClick={resetForm} disabled={saving} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-300 transition disabled:opacity-60">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Status */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {[
          { key: "all", label: "Semua" },
          { key: "pending", label: "Belum" },
          { key: "in_progress", label: "Proses" },
          { key: "completed", label: "Selesai" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              filterStatus === f.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label} ({statusCounts[f.key as keyof typeof statusCounts] || 0})
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {loadingTasks ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-gray-400">Memuat tugas...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
            Belum ada tugas
          </div>
        ) : (
          tasks.map((task) => {
            const statusCfg = STATUS_CONFIG[task.status];
            const priorityCfg = PRIORITY_CONFIG[task.priority];
            const StatusIcon = statusCfg.icon;
            const expanded = expandedId === task.id;
            const overdue = task.status !== "completed" && isOverdue(task.deadline);

            return (
              <div key={task.id} className={`bg-white rounded-2xl shadow-sm border transition ${overdue ? "border-red-200" : "border-gray-100"}`}>
                <div className="flex items-start gap-3 p-4">
                  {/* Status Toggle */}
                  <button
                    onClick={() => {
                      const next = task.status === "pending" ? "in_progress" : task.status === "in_progress" ? "completed" : "pending";
                      updateStatus(task.id, next);
                    }}
                    className={`mt-0.5 ${statusCfg.color} hover:scale-110 transition-transform`}
                    title={`Ubah ke ${task.status === "pending" ? "Sedang Dikerjakan" : task.status === "in_progress" ? "Selesai" : "Belum Dikerjakan"}`}
                  >
                    <StatusIcon className="w-5 h-5" />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${task.status === "completed" ? "text-gray-400 line-through" : "text-gray-900"}`}>
                        {task.title}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${priorityCfg.bg} ${priorityCfg.color}`}>
                        {priorityCfg.label}
                      </span>
                      {task.store_name && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: task.store_color + "20", color: task.store_color || undefined }}>
                          {task.store_name}
                        </span>
                      )}
                      {overdue && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 flex items-center gap-0.5">
                          <AlertCircle className="w-3 h-3" /> Terlambat
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      {task.deadline && (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="w-3 h-3" />
                          {formatDate(task.deadline.split("T")[0])}
                        </span>
                      )}
                      {task.assigned_to && <span>— {task.assigned_to}</span>}
                      {task.reminder_at && <Bell className="w-3 h-3 text-amber-400" />}
                    </div>
                  </div>

                  <button onClick={() => setExpandedId(expanded ? null : task.id)} className="p-1 text-gray-300 hover:text-gray-500">
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {/* Expanded Detail */}
                {expanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-gray-50 animate-fade-in">
                    {task.description && <p className="text-sm text-gray-600 mb-3 mt-3">{task.description}</p>}
                    <div className="flex flex-wrap gap-2">
                      {task.status !== "completed" && (
                        <button onClick={() => updateStatus(task.id, "completed")}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 text-xs font-medium rounded-lg hover:bg-green-200 transition">
                          <CheckCircle className="w-3.5 h-3.5" /> Selesai
                        </button>
                      )}
                      <button onClick={() => openEdit(task)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition">
                        <Flag className="w-3.5 h-3.5" /> Edit
                      </button>
                      {deleting === task.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(task.id)} className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700">Hapus</button>
                          <button onClick={() => setDeleting(null)} className="px-3 py-1.5 bg-gray-200 text-gray-600 text-xs font-medium rounded-lg">Batal</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleting(task.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-lg hover:bg-red-100 transition">
                          <Trash2 className="w-3.5 h-3.5" /> Hapus
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-300 mt-2">
                      Dibuat oleh {task.created_by} pada {task.created_at}
                      {task.completed_at && ` — Selesai pada ${task.completed_at}`}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
