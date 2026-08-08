"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus, Timer, Trash2, Zap, ZapOff, DollarSign,
  CalendarDays, Target, BarChart3, FileText,
  ChevronLeft, ChevronRight, Pencil,
  Brain, Users, Heart, Clipboard, RefreshCw, Shuffle,
  Sun, Moon, Mail, Coffee, Briefcase, ListChecks,
  MessageCircle, Building2, ChefHat, NotebookPen,
  Dumbbell, Lightbulb, Home, Calendar, Rocket,
  Crosshair, Package, Calculator, Settings, Megaphone,
  PenLine, Clock,
  type LucideIcon,
} from "lucide-react";
import Toast from "@/components/Toast";
import { useSession } from "@/lib/session-context";

interface AuditEntry {
  id: number;
  date: string;
  task_name: string;
  energy: "gave" | "took";
  value: "$" | "$$" | "$$$" | "$$$$";
  notes: string | null;
}

interface WeekBlock {
  id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  label: string;
  block_type: string;
}

interface WeeklyReview {
  id: number;
  week_start: string;
  went_well: string | null;
  energy_drain: string | null;
  to_delegate: string | null;
  wins: string | null;
  energy_score: number | null;
  focus_score: number | null;
  notes: string | null;
}

type Tab = "audit" | "week" | "review";

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const DAYS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

const BLOCK_TYPES: Record<string, { label: string; icon: LucideIcon; color: string; text: string; bg: string; border: string; accent: string }> = {
  focus:    { label: "Focus Time", icon: Brain,     color: "bg-blue-50",   text: "text-blue-800",   bg: "bg-blue-100",   border: "border-blue-300",   accent: "bg-blue-400" },
  meeting:  { label: "Meeting",    icon: Users,     color: "bg-purple-50", text: "text-purple-800", bg: "bg-purple-100", border: "border-purple-300", accent: "bg-purple-400" },
  personal: { label: "Personal",   icon: Heart,     color: "bg-green-50",  text: "text-green-800",  bg: "bg-green-100",  border: "border-green-300",  accent: "bg-green-400" },
  admin:    { label: "Admin",      icon: Clipboard, color: "bg-amber-50",  text: "text-amber-800",  bg: "bg-amber-100",  border: "border-amber-300",  accent: "bg-amber-400" },
  flex:     { label: "Flex Time",  icon: Shuffle,   color: "bg-gray-50",   text: "text-gray-700",   bg: "bg-gray-100",   border: "border-gray-300",   accent: "bg-gray-400" },
  routine:  { label: "Routine",    icon: RefreshCw, color: "bg-orange-50", text: "text-orange-800", bg: "bg-orange-100", border: "border-orange-300", accent: "bg-orange-400" },
};

const LABEL_ICONS: Record<string, LucideIcon> = {
  "deep work": Brain, "strategi": Crosshair, "produk": Package, "marketing": Megaphone,
  "konten": PenLine, "keuangan": Calculator, "operasional": Settings, "inovasi": Lightbulb,
  "riset": Crosshair, "proyek": Rocket, "standup": Users, "meeting": Users, "1-on-1": MessageCircle,
  "vendor": Building2, "partner": Briefcase, "email": Mail, "admin": Clipboard, "review": ListChecks,
  "planning": Calendar, "closing": ListChecks, "refleksi": NotebookPen, "morning": Sun,
  "persiapan": Moon, "istirahat": Coffee, "makan": Coffee, "sarapan": Coffee,
  "gym": Dumbbell, "olahraga": Dumbbell, "keluarga": Home, "pribadi": Lightbulb, "flex": Shuffle,
};

function getBlockIcon(label: string, blockType: string): LucideIcon {
  const lower = label.toLowerCase();
  for (const [keyword, icon] of Object.entries(LABEL_ICONS)) {
    if (lower.includes(keyword)) return icon;
  }
  return BLOCK_TYPES[blockType]?.icon || Clock;
}

const VALUE_OPTIONS = [
  { key: "$", label: "$", desc: "Siapa saja bisa" },
  { key: "$$", label: "$$", desc: "Butuh skill" },
  { key: "$$$", label: "$$$", desc: "Butuh keahlian" },
  { key: "$$$$", label: "$$$$", desc: "Hanya kamu" },
];

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function getMonday(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().split("T")[0];
}

function formatDateId(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function WaktuSayaPage() {
  const { sessionLoaded } = useSession();
  const [tab, setTab] = useState<Tab>("audit");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // ── Audit state ──
  const [auditDate, setAuditDate] = useState(todayStr());
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [showAuditForm, setShowAuditForm] = useState(false);
  const [editEntry, setEditEntry] = useState<AuditEntry | null>(null);
  const [auditForm, setAuditForm] = useState({ task_name: "", energy: "took" as "gave" | "took", value: "$" as string, notes: "" });
  const [savingAudit, setSavingAudit] = useState(false);

  // ── Perfect Week state ──
  const [blocks, setBlocks] = useState<WeekBlock[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(true);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [editBlock, setEditBlock] = useState<WeekBlock | null>(null);
  const [blockForm, setBlockForm] = useState({ day_of_week: 1, start_time: "09:00", end_time: "10:00", label: "", block_type: "focus" });
  const [savingBlock, setSavingBlock] = useState(false);

  // ── Review state ──
  const [reviewWeek, setReviewWeek] = useState(getMonday(new Date()));
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [allReviews, setAllReviews] = useState<WeeklyReview[]>([]);
  const [loadingReview, setLoadingReview] = useState(true);
  const [savingReview, setSavingReview] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    went_well: "", energy_drain: "", to_delegate: "", wins: "",
    energy_score: 5, focus_score: 5, notes: "",
  });

  // ── DRIP stats from audit data (last 14 days) ──
  const [dripData, setDripData] = useState<AuditEntry[]>([]);

  // ── Fetch audit entries ──
  useEffect(() => {
    if (tab !== "audit") return;
    setLoadingAudit(true);
    fetch(`/api/waktu-saya/audit?date=${auditDate}`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setEntries(Array.isArray(d) ? d : []); setLoadingAudit(false); })
      .catch(() => { setEntries([]); setLoadingAudit(false); });
  }, [auditDate, tab]);

  // ── Fetch DRIP data (last 14 days) ──
  useEffect(() => {
    if (tab !== "audit") return;
    const to = todayStr();
    const from = new Date(Date.now() - 13 * 86400000).toISOString().split("T")[0];
    fetch(`/api/waktu-saya/audit?from=${from}&to=${to}`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setDripData(Array.isArray(d) ? d : []))
      .catch(() => setDripData([]));
  }, [tab]);

  // ── Fetch perfect week ──
  useEffect(() => {
    if (tab !== "week") return;
    setLoadingWeek(true);
    fetch("/api/waktu-saya/week")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setBlocks(Array.isArray(d) ? d : []); setLoadingWeek(false); })
      .catch(() => { setBlocks([]); setLoadingWeek(false); });
  }, [tab]);

  // ── Fetch review ──
  useEffect(() => {
    if (tab !== "review") return;
    setLoadingReview(true);
    Promise.all([
      fetch(`/api/waktu-saya/review?week=${reviewWeek}`).then((r) => r.ok ? r.json() : null),
      fetch("/api/waktu-saya/review").then((r) => r.ok ? r.json() : []),
    ]).then(([single, all]) => {
      setReview(single);
      setAllReviews(Array.isArray(all) ? all : []);
      if (single) {
        setReviewForm({
          went_well: single.went_well || "", energy_drain: single.energy_drain || "",
          to_delegate: single.to_delegate || "", wins: single.wins || "",
          energy_score: single.energy_score || 5, focus_score: single.focus_score || 5,
          notes: single.notes || "",
        });
      } else {
        setReviewForm({ went_well: "", energy_drain: "", to_delegate: "", wins: "", energy_score: 5, focus_score: 5, notes: "" });
      }
      setLoadingReview(false);
    }).catch(() => setLoadingReview(false));
  }, [reviewWeek, tab]);

  function refreshAudit() {
    fetch(`/api/waktu-saya/audit?date=${auditDate}`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setEntries(Array.isArray(d) ? d : []));
  }

  // ── DRIP Matrix ──
  const drip = useMemo(() => {
    const d = { delegate: [] as AuditEntry[], replace: [] as AuditEntry[], invest: [] as AuditEntry[], produce: [] as AuditEntry[] };
    const lowValue = ["$", "$$"];
    const highValue = ["$$$", "$$$$"];
    for (const e of dripData) {
      if (e.energy === "took" && lowValue.includes(e.value)) d.delegate.push(e);
      else if (e.energy === "gave" && lowValue.includes(e.value)) d.replace.push(e);
      else if (e.energy === "took" && highValue.includes(e.value)) d.invest.push(e);
      else if (e.energy === "gave" && highValue.includes(e.value)) d.produce.push(e);
    }
    return d;
  }, [dripData]);

  // ── Audit handlers ──
  function resetAuditForm() {
    setAuditForm({ task_name: "", energy: "took", value: "$", notes: "" });
    setShowAuditForm(false);
    setEditEntry(null);
  }

  async function saveAudit() {
    if (!auditForm.task_name.trim()) { setToast({ message: "Nama tugas wajib diisi", type: "error" }); return; }
    if (savingAudit) return;
    setSavingAudit(true);
    try {
      const body = { ...auditForm, date: auditDate };
      const url = editEntry ? `/api/waktu-saya/audit/${editEntry.id}` : "/api/waktu-saya/audit";
      const method = editEntry ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { setToast({ message: "Tersimpan", type: "success" }); resetAuditForm(); refreshAudit(); }
      else setToast({ message: "Gagal menyimpan", type: "error" });
    } finally { setSavingAudit(false); }
  }

  async function deleteAudit(id: number) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setToast({ message: "Dihapus", type: "success" });
    await fetch(`/api/waktu-saya/audit/${id}`, { method: "DELETE" });
    refreshAudit();
  }

  // ── Week handlers ──
  function resetBlockForm() {
    setBlockForm({ day_of_week: 1, start_time: "09:00", end_time: "10:00", label: "", block_type: "focus" });
    setShowBlockForm(false);
    setEditBlock(null);
  }

  function refreshWeek() {
    fetch("/api/waktu-saya/week")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setBlocks(Array.isArray(d) ? d : []));
  }

  async function saveBlock() {
    if (!blockForm.label.trim()) { setToast({ message: "Label wajib diisi", type: "error" }); return; }
    if (savingBlock) return;
    setSavingBlock(true);
    try {
      const url = editBlock ? `/api/waktu-saya/week/${editBlock.id}` : "/api/waktu-saya/week";
      const method = editBlock ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(blockForm) });
      if (res.ok) { setToast({ message: "Tersimpan", type: "success" }); resetBlockForm(); refreshWeek(); }
      else setToast({ message: "Gagal menyimpan", type: "error" });
    } finally { setSavingBlock(false); }
  }

  async function deleteBlock(id: number) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setToast({ message: "Blok dihapus", type: "success" });
    await fetch(`/api/waktu-saya/week/${id}`, { method: "DELETE" });
    refreshWeek();
  }

  // ── Review handler ──
  async function saveReview() {
    if (savingReview) return;
    setSavingReview(true);
    try {
      const res = await fetch("/api/waktu-saya/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...reviewForm, week_start: reviewWeek }),
      });
      if (res.ok) {
        setToast({ message: "Review tersimpan", type: "success" });
        const updated = await fetch(`/api/waktu-saya/review?week=${reviewWeek}`).then((r) => r.ok ? r.json() : null);
        setReview(updated);
      } else setToast({ message: "Gagal menyimpan", type: "error" });
    } finally { setSavingReview(false); }
  }

  function shiftDate(days: number) {
    const d = new Date(auditDate + "T00:00:00");
    d.setDate(d.getDate() + days);
    setAuditDate(d.toISOString().split("T")[0]);
  }

  function shiftWeek(weeks: number) {
    const d = new Date(reviewWeek + "T00:00:00");
    d.setDate(d.getDate() + weeks * 7);
    setReviewWeek(d.toISOString().split("T")[0]);
  }

  if (!sessionLoaded) return null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Waktu Saya</h2>
        <p className="text-sm text-gray-500">Audit waktu, desain minggu sempurna, dan refleksi mingguan</p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-2 flex gap-1 overflow-x-auto">
        {([
          { key: "audit", label: "Audit Harian", icon: Zap },
          { key: "week", label: "Minggu Sempurna", icon: CalendarDays },
          { key: "review", label: "Review Mingguan", icon: BarChart3 },
        ] as const).map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition ${
                tab === t.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            ><Icon className="w-4 h-4" />{t.label}</button>
          );
        })}
      </div>

      {/* ═══ TAB: AUDIT ═══ */}
      {tab === "audit" && (
        <div className="space-y-4">
          {/* Date picker */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex items-center justify-between">
            <button onClick={() => shiftDate(-1)} className="p-1.5 hover:bg-gray-100 rounded-md"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
            <div className="text-center">
              <input type="date" value={auditDate} onChange={(e) => setAuditDate(e.target.value)}
                className="text-sm font-medium text-gray-900 border-none outline-none text-center bg-transparent cursor-pointer" />
              <div className="text-xs text-gray-400">{formatDateId(auditDate)}</div>
            </div>
            <button onClick={() => shiftDate(1)} className="p-1.5 hover:bg-gray-100 rounded-md"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
          </div>

          {/* Add button + form */}
          <div className="flex justify-end">
            <button onClick={() => { setShowAuditForm(true); setEditEntry(null); setAuditForm({ task_name: "", energy: "took", value: "$", notes: "" }); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
              <Plus className="w-4 h-4" />Tambah Tugas
            </button>
          </div>

          {showAuditForm && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 animate-slide-up space-y-3">
              <h3 className="font-semibold text-gray-900">{editEntry ? "Edit Tugas" : "Tambah Tugas Hari Ini"}</h3>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Apa yang kamu kerjakan? *</label>
                <input type="text" value={auditForm.task_name} onChange={(e) => setAuditForm({ ...auditForm, task_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="contoh: Cek email, Meeting tim, Review laporan..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Energi</label>
                  <div className="flex gap-2">
                    <button onClick={() => setAuditForm({ ...auditForm, energy: "gave" })}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium border-2 transition ${
                        auditForm.energy === "gave" ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}><Zap className="w-4 h-4" />Memberi</button>
                    <button onClick={() => setAuditForm({ ...auditForm, energy: "took" })}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium border-2 transition ${
                        auditForm.energy === "took" ? "border-red-500 bg-red-50 text-red-700" : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}><ZapOff className="w-4 h-4" />Menyedot</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Nilai</label>
                  <div className="flex gap-1">
                    {VALUE_OPTIONS.map((v) => (
                      <button key={v.key} onClick={() => setAuditForm({ ...auditForm, value: v.key })}
                        title={v.desc}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold border-2 transition ${
                          auditForm.value === v.key ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-400 hover:border-gray-300"
                        }`}>{v.label}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Catatan (opsional)</label>
                <input type="text" value={auditForm.notes} onChange={(e) => setAuditForm({ ...auditForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Detail tambahan..." />
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={saveAudit} disabled={savingAudit}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition flex items-center gap-2">
                  {savingAudit && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {savingAudit ? "Menyimpan..." : "Simpan"}
                </button>
                <button onClick={resetAuditForm} disabled={savingAudit} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition">Batal</button>
              </div>
            </div>
          )}

          {/* Entry list */}
          {loadingAudit ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-gray-400">Memuat data...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
              <Timer className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400">Belum ada tugas dicatat hari ini</p>
              <p className="text-xs text-gray-300 mt-1">Mulai catat setiap aktivitas untuk mengetahui ke mana waktu dan energi kamu pergi</p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => (
                <div key={e.id} className={`bg-white rounded-lg shadow-sm border p-3 flex items-center gap-3 ${
                  e.energy === "gave" ? "border-green-200" : "border-red-200"
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    e.energy === "gave" ? "bg-green-100" : "bg-red-100"
                  }`}>
                    {e.energy === "gave" ? <Zap className="w-4 h-4 text-green-600" /> : <ZapOff className="w-4 h-4 text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{e.task_name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        e.energy === "gave" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                      }`}>{e.energy === "gave" ? "Memberi Energi" : "Menyedot Energi"}</span>
                    </div>
                    {e.notes && <p className="text-xs text-gray-400 mt-0.5">{e.notes}</p>}
                  </div>
                  <span className="text-sm font-bold text-gray-500 shrink-0">{e.value}</span>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setEditEntry(e); setAuditForm({ task_name: e.task_name, energy: e.energy, value: e.value, notes: e.notes || "" }); setShowAuditForm(true); }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteAudit(e.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}

              {/* Daily summary */}
              <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                <MiniStat label="Total Tugas" value={entries.length} />
                <MiniStat label="Memberi Energi" value={entries.filter((e) => e.energy === "gave").length} />
                <MiniStat label="Menyedot Energi" value={entries.filter((e) => e.energy === "took").length} />
                <MiniStat label="Hanya Kamu ($$$$)" value={entries.filter((e) => e.value === "$$$$").length} />
              </div>
            </div>
          )}

          {/* DRIP Matrix */}
          {dripData.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
              <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2"><Target className="w-4 h-4" /> DRIP Matrix</h3>
              <p className="text-xs text-gray-400 mb-3">Berdasarkan {dripData.length} tugas dalam 14 hari terakhir</p>
              <div className="grid grid-cols-2 gap-3">
                <DripQuadrant title="Delegasikan" desc="Menyedot energi + nilai rendah → serahkan ke orang lain" color="bg-red-50 border-red-200" items={drip.delegate} />
                <DripQuadrant title="Gantikan" desc="Memberi energi + nilai rendah → latih seseorang" color="bg-amber-50 border-amber-200" items={drip.replace} />
                <DripQuadrant title="Investasi" desc="Menyedot energi + nilai tinggi → buat lebih efisien" color="bg-blue-50 border-blue-200" items={drip.invest} />
                <DripQuadrant title="Produksi" desc="Memberi energi + nilai tinggi → zona jenius kamu!" color="bg-green-50 border-green-200" items={drip.produce} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: PERFECT WEEK ═══ */}
      {tab === "week" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setShowBlockForm(true); setEditBlock(null); setBlockForm({ day_of_week: 1, start_time: "09:00", end_time: "10:00", label: "", block_type: "focus" }); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
              <Plus className="w-4 h-4" />Tambah Blok
            </button>
          </div>

          {showBlockForm && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 animate-slide-up space-y-3">
              <h3 className="font-semibold text-gray-900">{editBlock ? "Edit Blok" : "Blok Waktu Baru"}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hari</label>
                  <select value={blockForm.day_of_week} onChange={(e) => setBlockForm({ ...blockForm, day_of_week: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mulai</label>
                  <input type="time" value={blockForm.start_time} onChange={(e) => setBlockForm({ ...blockForm, start_time: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Selesai</label>
                  <input type="time" value={blockForm.end_time} onChange={(e) => setBlockForm({ ...blockForm, end_time: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipe</label>
                  <select value={blockForm.block_type} onChange={(e) => setBlockForm({ ...blockForm, block_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(BLOCK_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Label *</label>
                <input type="text" value={blockForm.label} onChange={(e) => setBlockForm({ ...blockForm, label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="contoh: Deep Work, Team Standup, Gym..." />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={saveBlock} disabled={savingBlock}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition flex items-center gap-2">
                  {savingBlock && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {savingBlock ? "Menyimpan..." : "Simpan"}
                </button>
                <button onClick={resetBlockForm} disabled={savingBlock} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition">Batal</button>
              </div>
            </div>
          )}

          {/* Week Grid */}
          {loadingWeek ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th className="w-[52px] p-2 text-right text-[10px] text-gray-400 border-b border-gray-200 border-r border-r-gray-200" />
                      {DAYS_SHORT.map((d, i) => (
                        <th key={i} className="p-2 text-center text-xs font-semibold text-gray-500 border-b border-gray-200 border-r border-r-gray-100 last:border-r-0">{d}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {HOURS.map((hour) => (
                      <tr key={hour} className="border-b border-gray-50">
                        <td className="text-right pr-2 pt-1 text-[10px] text-gray-400 border-r border-r-gray-200 align-top w-[52px]">
                          {`${String(hour).padStart(2, "0")}:00`}
                        </td>
                        {Array.from({ length: 7 }, (_, dayIdx) => {
                          const dayBlocks = blocks.filter((b) => {
                            if (b.day_of_week !== dayIdx) return false;
                            const startH = parseInt(b.start_time.split(":")[0]);
                            const endH = parseInt(b.end_time.split(":")[0]);
                            return hour >= startH && hour < endH;
                          });
                          const isStart = dayBlocks.some((b) => parseInt(b.start_time.split(":")[0]) === hour);
                          const block = dayBlocks[0];

                          if (!block) {
                            return (
                              <td key={dayIdx} className="border-r border-r-gray-50 last:border-r-0 h-[40px] hover:bg-gray-50 cursor-pointer transition-colors"
                                onClick={() => {
                                  setEditBlock(null);
                                  setBlockForm({ day_of_week: dayIdx, start_time: `${String(hour).padStart(2, "0")}:00`, end_time: `${String(hour + 1).padStart(2, "0")}:00`, label: "", block_type: "focus" });
                                  setShowBlockForm(true);
                                }} />
                            );
                          }

                          const bt = BLOCK_TYPES[block.block_type] || BLOCK_TYPES.flex;
                          if (!isStart) {
                            return <td key={dayIdx} className={`border-r border-r-gray-50 last:border-r-0 h-[40px] ${bt.color}`} />;
                          }

                          const spanHours = parseInt(block.end_time.split(":")[0]) - parseInt(block.start_time.split(":")[0]);
                          const BlockIcon = getBlockIcon(block.label, block.block_type);

                          return (
                            <td key={dayIdx} className={`border-r border-r-gray-50 last:border-r-0 h-[40px] ${bt.color} relative group cursor-pointer`}
                              rowSpan={spanHours > 1 ? spanHours : undefined}
                              onClick={() => { setEditBlock(block); setBlockForm({ day_of_week: block.day_of_week, start_time: block.start_time, end_time: block.end_time, label: block.label, block_type: block.block_type }); setShowBlockForm(true); }}>
                              <div className={`absolute inset-[2px] rounded ${bt.bg} ${bt.border} border-l-[3px] p-1.5 flex gap-1.5 items-start overflow-hidden`}>
                                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${bt.accent}`}>
                                  <BlockIcon className="w-3 h-3 text-white" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className={`text-[11px] font-semibold ${bt.text} leading-tight truncate`}>{block.label}</div>
                                  <div className="text-[9px] text-gray-400 mt-0.5">{block.start_time}–{block.end_time}</div>
                                </div>
                              </div>
                              <button onClick={(ev) => { ev.stopPropagation(); deleteBlock(block.id); }}
                                className="absolute top-1 right-1 hidden group-hover:flex w-5 h-5 items-center justify-center bg-white rounded shadow-sm z-10">
                                <Trash2 className="w-3 h-3 text-red-400" />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3">
                {Object.entries(BLOCK_TYPES).map(([key, bt]) => {
                  const Icon = bt.icon;
                  return (
                    <div key={key} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <div className={`w-5 h-5 rounded flex items-center justify-center ${bt.accent}`}>
                        <Icon className="w-3 h-3 text-white" />
                      </div>
                      {bt.label}
                    </div>
                  );
                })}
              </div>

              {blocks.length === 0 && (
                <div className="text-center py-4">
                  <CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Klik cell kosong di grid untuk mulai mendesain minggu ideal kamu</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ TAB: REVIEW ═══ */}
      {tab === "review" && (
        <div className="space-y-4">
          {/* Week picker */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex items-center justify-between">
            <button onClick={() => shiftWeek(-1)} className="p-1.5 hover:bg-gray-100 rounded-md"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
            <div className="text-center">
              <div className="text-sm font-medium text-gray-900">Minggu {reviewWeek}</div>
              <div className="text-xs text-gray-400">{review ? "Sudah diisi" : "Belum diisi"}</div>
            </div>
            <button onClick={() => shiftWeek(1)} className="p-1.5 hover:bg-gray-100 rounded-md"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
          </div>

          {loadingReview ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><FileText className="w-4 h-4" /> Review Minggu Ini</h3>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Apa yang berjalan baik?</label>
                  <textarea value={reviewForm.went_well} onChange={(e) => setReviewForm({ ...reviewForm, went_well: e.target.value })}
                    rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Hal-hal positif minggu ini..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Apa yang menguras energi?</label>
                  <textarea value={reviewForm.energy_drain} onChange={(e) => setReviewForm({ ...reviewForm, energy_drain: e.target.value })}
                    rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Tugas atau situasi yang bikin capek..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Apa yang harus didelegasikan minggu depan?</label>
                  <textarea value={reviewForm.to_delegate} onChange={(e) => setReviewForm({ ...reviewForm, to_delegate: e.target.value })}
                    rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Tugas yang bisa diserahkan ke orang lain..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kemenangan kecil / wins</label>
                  <textarea value={reviewForm.wins} onChange={(e) => setReviewForm({ ...reviewForm, wins: e.target.value })}
                    rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Pencapaian yang patut dirayakan..." />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Skor Energi: <span className="font-bold text-gray-900">{reviewForm.energy_score}/10</span></label>
                  <input type="range" min={1} max={10} value={reviewForm.energy_score}
                    onChange={(e) => setReviewForm({ ...reviewForm, energy_score: Number(e.target.value) })}
                    className="w-full accent-blue-600" />
                  <div className="flex justify-between text-[10px] text-gray-400"><span>Habis</span><span>Penuh</span></div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Skor Fokus: <span className="font-bold text-gray-900">{reviewForm.focus_score}/10</span></label>
                  <input type="range" min={1} max={10} value={reviewForm.focus_score}
                    onChange={(e) => setReviewForm({ ...reviewForm, focus_score: Number(e.target.value) })}
                    className="w-full accent-blue-600" />
                  <div className="flex justify-between text-[10px] text-gray-400"><span>Berantakan</span><span>Laser</span></div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Catatan tambahan</label>
                <textarea value={reviewForm.notes} onChange={(e) => setReviewForm({ ...reviewForm, notes: e.target.value })}
                  rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Insight lain yang perlu dicatat..." />
              </div>

              <button onClick={saveReview} disabled={savingReview}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition flex items-center gap-2">
                {savingReview && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {savingReview ? "Menyimpan..." : review ? "Update Review" : "Simpan Review"}
              </button>
            </div>
          )}

          {/* History chart */}
          {allReviews.length > 1 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Tren Energi & Fokus</h3>
              <div className="space-y-2">
                {allReviews.slice(0, 12).map((r) => (
                  <div key={r.id} className="flex items-center gap-3 text-xs">
                    <span className="w-20 text-gray-500 shrink-0">{r.week_start}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 w-12 shrink-0">Energi</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                        <div className="h-2.5 rounded-full bg-green-500 transition-all" style={{ width: `${(r.energy_score || 0) * 10}%` }} />
                      </div>
                      <span className="font-bold text-gray-700 w-6 text-right">{r.energy_score}</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 w-12 shrink-0">Fokus</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                        <div className="h-2.5 rounded-full bg-blue-500 transition-all" style={{ width: `${(r.focus_score || 0) * 10}%` }} />
                      </div>
                      <span className="font-bold text-gray-700 w-6 text-right">{r.focus_score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-md px-3 py-2">
      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-bold text-gray-900">{value}</div>
    </div>
  );
}

function DripQuadrant({ title, desc, color, items }: { title: string; desc: string; color: string; items: AuditEntry[] }) {
  const unique = [...new Set(items.map((i) => i.task_name))];
  return (
    <div className={`rounded-lg border p-3 ${color}`}>
      <div className="text-xs font-bold text-gray-800">{title}</div>
      <div className="text-[10px] text-gray-500 mb-2">{desc}</div>
      {unique.length === 0 ? (
        <div className="text-[10px] text-gray-400 italic">Belum ada data</div>
      ) : (
        <div className="space-y-0.5">
          {unique.slice(0, 5).map((name) => (
            <div key={name} className="text-xs text-gray-700 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-gray-400 shrink-0" />
              {name}
              <span className="text-[10px] text-gray-400 ml-auto">{items.filter((i) => i.task_name === name).length}x</span>
            </div>
          ))}
          {unique.length > 5 && <div className="text-[10px] text-gray-400">+{unique.length - 5} lainnya</div>}
        </div>
      )}
    </div>
  );
}
