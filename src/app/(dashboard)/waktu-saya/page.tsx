"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Timer, Trash2, Zap, ZapOff,
  CalendarDays, Target, BarChart3, FileText,
  ChevronLeft, ChevronRight, Pencil, AlertTriangle, Trophy,
  Brain, Users, Heart, Clipboard, RefreshCw, Shuffle,
  Sun, Moon, Mail, Coffee, Briefcase, ListChecks,
  MessageCircle, Building2, NotebookPen,
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
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
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

function getWeekDates(offset: number): Date[] {
  const now = new Date();
  const day = now.getDay();
  const diffToSunday = -day;
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + diffToSunday + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function formatWeekRange(dates: Date[]): string {
  const first = dates[0];
  const last = dates[6];
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()} - ${last.getDate()} ${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
  }
  return `${first.getDate()} ${MONTHS[first.getMonth()]} - ${last.getDate()} ${MONTHS[last.getMonth()]} ${last.getFullYear()}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
  const [plannedBlocks, setPlannedBlocks] = useState<WeekBlock[]>([]);

  // ── Perfect Week state ──
  const [blocks, setBlocks] = useState<WeekBlock[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(true);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [editBlock, setEditBlock] = useState<WeekBlock | null>(null);
  const [blockForm, setBlockForm] = useState({ day_of_week: 1, start_time: "09:00", end_time: "10:00", label: "", block_type: "focus" });
  const [savingBlock, setSavingBlock] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

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

  // ── DRIP stats ──
  const [dripData, setDripData] = useState<AuditEntry[]>([]);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const today = useMemo(() => new Date(), []);

  // ── Fetch audit entries ──
  useEffect(() => {
    if (tab !== "audit") return;
    setLoadingAudit(true);
    Promise.all([
      fetch(`/api/waktu-saya/audit?date=${auditDate}`).then((r) => r.ok ? r.json() : []),
      fetch("/api/waktu-saya/week").then((r) => r.ok ? r.json() : []),
    ]).then(([auditData, weekData]) => {
      setEntries(Array.isArray(auditData) ? auditData : []);
      const dayOfWeek = new Date(auditDate + "T00:00:00").getDay();
      const dayBlocks = (Array.isArray(weekData) ? weekData : [])
        .filter((b: WeekBlock) => b.day_of_week === dayOfWeek)
        .sort((a: WeekBlock, b: WeekBlock) => a.start_time.localeCompare(b.start_time));
      setPlannedBlocks(dayBlocks);
      setLoadingAudit(false);
    }).catch(() => { setEntries([]); setPlannedBlocks([]); setLoadingAudit(false); });
  }, [auditDate, tab]);

  // ── Fetch DRIP data ──
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

  const refreshAudit = useCallback(() => {
    Promise.all([
      fetch(`/api/waktu-saya/audit?date=${auditDate}`).then((r) => r.ok ? r.json() : []),
      fetch("/api/waktu-saya/week").then((r) => r.ok ? r.json() : []),
    ]).then(([auditData, weekData]) => {
      setEntries(Array.isArray(auditData) ? auditData : []);
      const dayOfWeek = new Date(auditDate + "T00:00:00").getDay();
      setPlannedBlocks((Array.isArray(weekData) ? weekData : []).filter((b: WeekBlock) => b.day_of_week === dayOfWeek).sort((a: WeekBlock, b: WeekBlock) => a.start_time.localeCompare(b.start_time)));
    });
  }, [auditDate]);

  // ── Planned blocks not yet audited ──
  const unauditedBlocks = useMemo(() => {
    const auditedNames = new Set(entries.map((e) => e.task_name.toLowerCase()));
    return plannedBlocks.filter((b) => !auditedNames.has(b.label.toLowerCase()));
  }, [plannedBlocks, entries]);

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

  // ── Daily analysis ──
  const analysis = useMemo(() => {
    if (entries.length === 0) return null;
    const gave = entries.filter((e) => e.energy === "gave").length;
    const took = entries.filter((e) => e.energy === "took").length;
    const highVal = entries.filter((e) => e.value === "$$$" || e.value === "$$$$").length;
    const lowVal = entries.filter((e) => e.value === "$" || e.value === "$$").length;
    const geniusZone = entries.filter((e) => e.energy === "gave" && (e.value === "$$$" || e.value === "$$$$")).length;
    const delegateZone = entries.filter((e) => e.energy === "took" && (e.value === "$" || e.value === "$$"));
    const total = entries.length;

    const energyRatio = Math.round((gave / total) * 100);
    const valueScore = Math.round((highVal / total) * 100);
    const productivityScore = Math.round((energyRatio * 0.4 + valueScore * 0.4 + (geniusZone / total) * 100 * 0.2));
    const planExecuted = plannedBlocks.length > 0
      ? plannedBlocks.filter((b) => entries.some((e) => e.task_name.toLowerCase() === b.label.toLowerCase())).length
      : 0;

    const valDist = {
      "$$$$": entries.filter((e) => e.value === "$$$$").length,
      "$$$": entries.filter((e) => e.value === "$$$").length,
      "$$": entries.filter((e) => e.value === "$$").length,
      "$": entries.filter((e) => e.value === "$").length,
    };

    let label = "Rendah";
    if (productivityScore >= 70) label = "Sangat baik";
    else if (productivityScore >= 50) label = "Cukup baik";
    else if (productivityScore >= 30) label = "Perlu perbaikan";

    return { gave, took, total, highVal, lowVal, geniusZone, delegateZone, energyRatio, productivityScore, label, planExecuted, plannedTotal: plannedBlocks.length, valDist };
  }, [entries, plannedBlocks]);

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

  async function quickAudit(block: WeekBlock, energy: "gave" | "took", value: string) {
    const res = await fetch("/api/waktu-saya/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_name: block.label, energy, value, date: auditDate, notes: `${block.start_time}–${block.end_time}` }),
    });
    if (res.ok) { setToast({ message: "Tersimpan", type: "success" }); refreshAudit(); }
    else setToast({ message: "Gagal menyimpan", type: "error" });
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
    fetch("/api/waktu-saya/week").then((r) => r.ok ? r.json() : []).then((d) => setBlocks(Array.isArray(d) ? d : []));
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
        method: "POST", headers: { "Content-Type": "application/json" },
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

  function shiftReviewWeek(weeks: number) {
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

          {loadingAudit ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-gray-400">Memuat data...</p>
            </div>
          ) : (
            <>
              {/* Unaudited planned blocks */}
              {unauditedBlocks.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-blue-500" />
                      Tugas dari rencana minggu sempurna
                    </h3>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {unauditedBlocks.length} belum diaudit
                    </span>
                  </div>
                  {unauditedBlocks.map((block) => {
                    const bt = BLOCK_TYPES[block.block_type] || BLOCK_TYPES.flex;
                    const BlockIcon = getBlockIcon(block.label, block.block_type);
                    return (
                      <div key={block.id} className="flex items-center gap-3 py-2 border-t border-gray-100 first:border-t-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bt.accent}`}>
                          <BlockIcon className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900">{block.label}</div>
                          <div className="text-[11px] text-gray-400">{block.start_time}–{block.end_time}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-gray-400 mr-1">Energi:</span>
                          <button onClick={() => quickAudit(block, "gave", "$$")}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition text-[11px] font-medium">
                            <Zap className="w-3 h-3" />Memberi
                          </button>
                          <button onClick={() => quickAudit(block, "took", "$$")}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-red-300 text-red-600 bg-red-50 hover:bg-red-100 transition text-[11px] font-medium">
                            <ZapOff className="w-3 h-3" />Menyedot
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-gray-400">Klik energi untuk langsung audit. Nilai default $$, bisa diedit setelahnya.</p>
                </div>
              )}

              {/* Manual add button */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  {entries.length > 0 && `${entries.length} tugas sudah diaudit`}
                  {entries.length > 0 && plannedBlocks.length > 0 && ` — ${plannedBlocks.filter((b) => entries.some((e) => e.task_name.toLowerCase() === b.label.toLowerCase())).length}/${plannedBlocks.length} dari rencana`}
                </div>
                <button onClick={() => { setShowAuditForm(true); setEditEntry(null); setAuditForm({ task_name: "", energy: "took", value: "$", notes: "" }); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                  <Plus className="w-4 h-4" />Tambah manual
                </button>
              </div>

              {showAuditForm && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 animate-slide-up space-y-3">
                  <h3 className="font-semibold text-gray-900">{editEntry ? "Edit Tugas" : "Tambah Tugas Manual"}</h3>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Apa yang kamu kerjakan? *</label>
                    <input type="text" value={auditForm.task_name} onChange={(e) => setAuditForm({ ...auditForm, task_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="contoh: Telepon supplier, Meeting dadakan..." />
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
                          <button key={v.key} onClick={() => setAuditForm({ ...auditForm, value: v.key })} title={v.desc}
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

              {/* Audited entries */}
              {entries.length === 0 && unauditedBlocks.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
                  <Timer className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400">Belum ada tugas hari ini</p>
                  <p className="text-xs text-gray-300 mt-1">Tambah blok di Minggu Sempurna atau catat tugas manual</p>
                </div>
              ) : entries.length > 0 && (
                <div className="space-y-2">
                  {entries.map((e) => {
                    const isFromPlan = plannedBlocks.some((b) => b.label.toLowerCase() === e.task_name.toLowerCase());
                    return (
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
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                              isFromPlan ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                            }`}>{isFromPlan ? "Dari rencana" : "Manual"}</span>
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
                    );
                  })}
                </div>
              )}

              {/* ── Analysis ── */}
              {analysis && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" /> Analisa hari ini
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <MiniStat label="Skor produktivitas" value={`${analysis.productivityScore}%`} sub={analysis.label}
                      color={analysis.productivityScore >= 70 ? "text-green-600" : analysis.productivityScore >= 50 ? "text-blue-600" : "text-amber-600"} />
                    <MiniStat label="Energi" value={`${analysis.gave}/${analysis.total}`} sub={`${analysis.energyRatio}% memberi`} />
                    <MiniStat label="Zona jenius" value={`${analysis.geniusZone}`} sub="$$$$  + memberi" color="text-green-600" />
                    <MiniStat label="Rencana dieksekusi" value={analysis.plannedTotal > 0 ? `${analysis.planExecuted}/${analysis.plannedTotal}` : "—"} sub={analysis.plannedTotal > 0 ? `${Math.round((analysis.planExecuted / analysis.plannedTotal) * 100)}% on track` : "Tidak ada rencana"} />
                  </div>

                  {/* Energy bar */}
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-2">Distribusi energi</div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] text-gray-500 w-20 text-right shrink-0">Memberi</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-3">
                        <div className="h-3 rounded-full bg-green-500 transition-all" style={{ width: `${analysis.energyRatio}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-700 w-6">{analysis.gave}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-500 w-20 text-right shrink-0">Menyedot</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-3">
                        <div className="h-3 rounded-full bg-red-400 transition-all" style={{ width: `${100 - analysis.energyRatio}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-700 w-6">{analysis.took}</span>
                    </div>
                  </div>

                  {/* Value distribution */}
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-2">Distribusi nilai</div>
                    {(["$$$$", "$$$", "$$", "$"] as const).map((v) => (
                      <div key={v} className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] text-gray-500 w-20 text-right shrink-0 font-medium">{v}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                          <div className="h-2.5 rounded-full bg-blue-400 transition-all"
                            style={{ width: analysis.total > 0 ? `${(analysis.valDist[v] / analysis.total) * 100}%` : "0%",
                              opacity: v === "$$$$" ? 1 : v === "$$$" ? 0.8 : v === "$$" ? 0.5 : 0.3 }} />
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-6">{analysis.valDist[v]}</span>
                      </div>
                    ))}
                  </div>

                  {/* Insights */}
                  {analysis.delegateZone.length > 0 && (
                    <div className="bg-amber-50 border-l-[3px] border-amber-400 p-3 rounded-r-lg">
                      <div className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Perlu perhatian
                      </div>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        {analysis.delegateZone.length} tugas menyedot energi dengan nilai rendah: {analysis.delegateZone.map((e) => `"${e.task_name}"`).join(", ")}. Pertimbangkan untuk mendelegasikan.
                      </p>
                    </div>
                  )}
                  {analysis.geniusZone > 0 && (
                    <div className="bg-green-50 border-l-[3px] border-green-400 p-3 rounded-r-lg">
                      <div className="text-xs font-semibold text-green-800 flex items-center gap-1.5 mb-1">
                        <Trophy className="w-3.5 h-3.5" /> Zona jenius
                      </div>
                      <p className="text-xs text-green-700 leading-relaxed">
                        {entries.filter((e) => e.energy === "gave" && (e.value === "$$$" || e.value === "$$$$")).map((e) => `"${e.task_name}"`).join(", ")} ada di zona produksi. Ini kekuatan utamamu — alokasikan lebih banyak waktu di sini.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* DRIP Matrix */}
              {dripData.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                  <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2"><Target className="w-4 h-4" /> DRIP Matrix</h3>
                  <p className="text-xs text-gray-400 mb-3">Berdasarkan {dripData.length} tugas dalam 14 hari terakhir</p>
                  <div className="grid grid-cols-2 gap-3">
                    <DripQuadrant title="Delegasikan" desc="Menyedot energi + nilai rendah" color="bg-red-50 border-red-200" items={drip.delegate} />
                    <DripQuadrant title="Gantikan" desc="Memberi energi + nilai rendah" color="bg-amber-50 border-amber-200" items={drip.replace} />
                    <DripQuadrant title="Investasi" desc="Menyedot energi + nilai tinggi" color="bg-blue-50 border-blue-200" items={drip.invest} />
                    <DripQuadrant title="Produksi" desc="Memberi energi + nilai tinggi" color="bg-green-50 border-green-200" items={drip.produce} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ TAB: PERFECT WEEK ═══ */}
      {tab === "week" && (
        <div className="space-y-4">
          {/* Week navigation */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex items-center justify-between">
            <button onClick={() => setWeekOffset((o) => o - 1)} className="p-1.5 hover:bg-gray-100 rounded-md">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="text-center">
              <div className="text-sm font-semibold text-gray-900">{formatWeekRange(weekDates)}</div>
              <div className="text-xs text-gray-400">{weekOffset === 0 ? "Minggu ini" : weekOffset === 1 ? "Minggu depan" : weekOffset === -1 ? "Minggu lalu" : `${weekOffset > 0 ? "+" : ""}${weekOffset} minggu`}</div>
            </div>
            <button onClick={() => setWeekOffset((o) => o + 1)} className="p-1.5 hover:bg-gray-100 rounded-md">
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

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
                      {weekDates.map((date, i) => {
                        const isToday = isSameDay(date, today);
                        return (
                          <th key={i} className={`p-2 text-center border-b border-gray-200 border-r border-r-gray-100 last:border-r-0 ${isToday ? "bg-blue-50" : ""}`}>
                            <div className="text-[10px] text-gray-400 font-medium">{DAYS_SHORT[i]}</div>
                            <div className={`text-base font-semibold mt-0.5 ${isToday ? "text-blue-600" : "text-gray-800"}`}>{date.getDate()}</div>
                          </th>
                        );
                      })}
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
                          const isToday = isSameDay(weekDates[dayIdx], today);
                          const todayBg = isToday ? "bg-blue-50/30" : "";

                          if (!block) {
                            return (
                              <td key={dayIdx} className={`border-r border-r-gray-50 last:border-r-0 h-[40px] hover:bg-gray-50 cursor-pointer transition-colors ${todayBg}`}
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex items-center justify-between">
            <button onClick={() => shiftReviewWeek(-1)} className="p-1.5 hover:bg-gray-100 rounded-md"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
            <div className="text-center">
              <div className="text-sm font-medium text-gray-900">Minggu {reviewWeek}</div>
              <div className="text-xs text-gray-400">{review ? "Sudah diisi" : "Belum diisi"}</div>
            </div>
            <button onClick={() => shiftReviewWeek(1)} className="p-1.5 hover:bg-gray-100 rounded-md"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
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

function MiniStat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`text-base font-bold ${color || "text-gray-900"}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
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
