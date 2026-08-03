"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays, CheckCircle, Circle, Highlighter, ListChecks, NotebookPen,
  Plus, Sparkles, Trash2, UsersRound,
} from "lucide-react";
import Toast from "@/components/Toast";
import { formatDate } from "@/lib/utils";

interface Store { id: number; short_name: string; color: string; }

interface MeetingAction {
  id: number;
  title: string;
  assigned_to: string | null;
  due_date: string | null;
  status: "pending" | "in_progress" | "completed";
  task_id: number | null;
}

interface Meeting {
  id: number;
  title: string;
  meeting_date: string;
  participants: string | null;
  agenda: string | null;
  notes: string | null;
  store_id: number | null;
  store_name: string | null;
  store_color: string | null;
  created_by_name: string | null;
  action_items: MeetingAction[];
}

interface ActionForm {
  title: string;
  assigned_to: string;
  due_date: string;
  create_task: boolean;
  create_note: boolean;
  priority: "low" | "normal" | "high";
  description: string;
}

type HighlightColor = "yellow" | "red" | "green";

interface AiMeetingResult {
  polished_notes: string;
  summary: string;
  important_points: string[];
  action_items: {
    title: string;
    assigned_to?: string | null;
    due_date?: string | null;
    priority?: "low" | "normal" | "high";
    description?: string | null;
  }[];
}

const emptyAction: ActionForm = {
  title: "",
  assigned_to: "",
  due_date: "",
  create_task: false,
  create_note: true,
  priority: "normal",
  description: "",
};
const HIGHLIGHT_COLORS: { key: HighlightColor; label: string; className: string; activeClassName: string }[] = [
  { key: "yellow", label: "Kuning", className: "bg-yellow-300 text-yellow-950", activeClassName: "ring-yellow-500" },
  { key: "red", label: "Merah", className: "bg-red-300 text-red-950", activeClassName: "ring-red-500" },
  { key: "green", label: "Hijau", className: "bg-green-300 text-green-950", activeClassName: "ring-green-500" },
];

function getHighlightClass(color: HighlightColor) {
  return HIGHLIGHT_COLORS.find((item) => item.key === color)?.className || HIGHLIGHT_COLORS[0].className;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

function countHighlights(notes: string | null) {
  return (notes?.match(/==(?:(?:yellow|red|green):)?([\s\S]+?)==|<mark\b/gi) || []).length;
}

function stripHtml(value: string) {
  if (typeof document === "undefined") return value.replace(/<[^>]*>/g, " ");
  const container = document.createElement("div");
  container.innerHTML = value;
  return container.textContent || "";
}

function legacyHighlightsToHtml(value: string) {
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/==(?:(yellow|red|green):)?([\s\S]+?)==/g, (_match, color: HighlightColor | undefined, text: string) => (
      `<mark data-highlight="${color || "yellow"}" class="${getHighlightClass(color || "yellow")}">${text}</mark>`
    ))
    .replace(/\n/g, "<br>");
}

function renderMeetingNoteHtml(value: string) {
  if (!value) return "";
  if (value.includes("<mark") || value.includes("<br") || value.includes("<div") || value.includes("<p")) {
    return value;
  }
  return legacyHighlightsToHtml(value);
}

function textToEditorHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

export default function RapatPage() {
  const notesRef = useRef<HTMLDivElement | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("yellow");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiMeetingResult | null>(null);
  const [form, setForm] = useState({
    title: "",
    meeting_date: todayKey(),
    participants: "",
    notes: "",
    store_id: "",
  });
  const [actionItems, setActionItems] = useState<ActionForm[]>([{ ...emptyAction }]);

  useEffect(() => {
    fetch("/api/stores").then((r) => r.ok ? r.json() : []).then((data) => setStores(Array.isArray(data) ? data : [])).catch(() => setStores([]));
  }, []);

  useEffect(() => {
    fetch(`/api/meetings?month=${selectedMonth}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setMeetings(Array.isArray(data) ? data : []))
      .catch(() => setMeetings([]));
  }, [selectedMonth]);

  async function refreshMeetings() {
    const res = await fetch(`/api/meetings?month=${selectedMonth}`);
    const data = res.ok ? await res.json() : [];
    setMeetings(Array.isArray(data) ? data : []);
  }

  function resetForm() {
    setForm({
      title: "",
      meeting_date: todayKey(),
      participants: "",
      notes: "",
      store_id: "",
    });
    setActionItems([{ ...emptyAction }]);
    setAiResult(null);
    setShowForm(false);
    if (notesRef.current) notesRef.current.innerHTML = "";
  }

  function updateAction(index: number, patch: Partial<ActionForm>) {
    setActionItems((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function addActionItem() {
    setActionItems((prev) => [...prev, { ...emptyAction }]);
  }

  function removeActionItem(index: number) {
    setActionItems((prev) => prev.length === 1 ? [{ ...emptyAction }] : prev.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleAiAssist() {
    const editorHtml = notesRef.current?.innerHTML || form.notes;
    if (!editorHtml || stripHtml(editorHtml).trim().length < 10) {
      setToast({ message: "Isi catatan rapat dulu sebelum memakai AI", type: "error" });
      notesRef.current?.focus();
      return;
    }

    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await fetch("/api/ai/meeting-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          meeting_date: form.meeting_date,
          participants: form.participants,
          notes: editorHtml,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI gagal memproses catatan");
      setAiResult(data as AiMeetingResult);
      setToast({ message: "AI selesai merapikan catatan", type: "success" });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "AI gagal memproses catatan", type: "error" });
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiNotes() {
    if (!aiResult?.polished_notes) return;
    const html = textToEditorHtml(aiResult.polished_notes);
    if (notesRef.current) notesRef.current.innerHTML = html;
    setForm((prev) => ({ ...prev, notes: html }));
    setToast({ message: "Catatan sudah dirapikan oleh AI", type: "success" });
  }

  function applyAiActions() {
    if (!aiResult?.action_items.length) {
      setToast({ message: "AI tidak menemukan tugas lanjutan yang jelas", type: "error" });
      return;
    }

    setActionItems(aiResult.action_items.map((item) => ({
      title: item.title,
      assigned_to: item.assigned_to || "",
      due_date: item.due_date || "",
      create_task: false,
      create_note: true,
      priority: item.priority || "normal",
      description: item.description || "",
    })));
    setToast({ message: "Tugas dari AI sudah masuk daftar review", type: "success" });
  }

  function highlightSelection() {
    const editor = notesRef.current;
    if (!editor) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setToast({ message: "Blok teks catatan dulu, lalu klik Stabilo", type: "error" });
      editor.focus();
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer) || selection.toString().trim() === "") {
      setToast({ message: "Blok teks catatan dulu, lalu klik Stabilo", type: "error" });
      editor.focus();
      return;
    }

    const mark = document.createElement("mark");
    mark.dataset.highlight = highlightColor;
    mark.className = getHighlightClass(highlightColor);

    try {
      const selectedContent = range.extractContents();
      mark.appendChild(selectedContent);
      range.insertNode(mark);
      selection.removeAllRanges();
      const nextRange = document.createRange();
      nextRange.selectNodeContents(mark);
      selection.addRange(nextRange);
      setForm((prev) => ({ ...prev, notes: editor.innerHTML }));
    } catch {
      setToast({ message: "Stabilo gagal diterapkan. Blok satu bagian teks saja.", type: "error" });
    }
  }

  async function handleSave() {
    if (!form.title.trim() || !form.meeting_date) {
      setToast({ message: "Judul dan tanggal rapat wajib diisi", type: "error" });
      return;
    }

    const res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        meeting_date: form.meeting_date,
        participants: form.participants,
        agenda: null,
        notes: form.notes,
        decisions: null,
        important_points: null,
        store_id: form.store_id ? Number(form.store_id) : null,
        action_items: actionItems.filter((item) => item.title.trim()),
      }),
    });

    if (res.ok) {
      setToast({ message: "Catatan rapat disimpan", type: "success" });
      resetForm();
      refreshMeetings();
    } else {
      const data = await res.json();
      setToast({ message: data.error || "Gagal menyimpan rapat", type: "error" });
    }
  }

  async function updateActionStatus(meetingId: number, action: MeetingAction) {
    const next = action.status === "completed" ? "pending" : "completed";
    await fetch(`/api/meetings/${meetingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action_id: action.id, task_id: action.task_id, status: next }),
    });
    refreshMeetings();
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDeleting(null);
      setToast({ message: "Catatan rapat dihapus", type: "success" });
      refreshMeetings();
    }
  }

  const stats = useMemo(() => {
    const totalActions = meetings.reduce((sum, meeting) => sum + meeting.action_items.length, 0);
    const completedActions = meetings.reduce((sum, meeting) => sum + meeting.action_items.filter((item) => item.status === "completed").length, 0);
    const highlights = meetings.reduce((sum, meeting) => sum + countHighlights(meeting.notes), 0);
    return { totalMeetings: meetings.length, totalActions, completedActions, highlights };
  }, [meetings]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Rapat</h2>
          <p className="text-sm text-gray-500">Buku notulen digital untuk mencatat hasil rapat</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" />
          Rapat Baru
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<NotebookPen className="w-4 h-4 text-blue-600" />} label="Rapat" value={stats.totalMeetings} />
        <StatCard icon={<Highlighter className="w-4 h-4 text-amber-600" />} label="Stabilo" value={stats.highlights} />
        <StatCard icon={<ListChecks className="w-4 h-4 text-emerald-600" />} label="Tugas Lanjutan" value={stats.totalActions} />
        <StatCard icon={<CheckCircle className="w-4 h-4 text-green-600" />} label="Selesai" value={stats.completedActions} />
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden animate-slide-up">
          <div className="border-b border-gray-100 px-4 py-3 bg-slate-50">
            <h3 className="font-semibold text-gray-900">Catatan Rapat Baru</h3>
          </div>

          <div className="p-4 space-y-4">
            <div className="grid md:grid-cols-[1fr_170px] gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Judul Rapat *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="contoh: Rapat evaluasi operasional mingguan"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal *</label>
                <input
                  type="date"
                  value={form.meeting_date}
                  onChange={(e) => setForm({ ...form, meeting_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-[1fr_220px] gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Peserta</label>
                <input
                  type="text"
                  value={form.participants}
                  onChange={(e) => setForm({ ...form, participants: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nama peserta rapat"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Toko Terkait</label>
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

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-3 py-2 bg-yellow-50 border-b border-yellow-100">
                <label className="text-sm font-semibold text-gray-900">Catatan Rapat</label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {HIGHLIGHT_COLORS.map((color) => (
                      <button
                        key={color.key}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setHighlightColor(color.key)}
                        className={`w-7 h-7 rounded-md ${color.className} ${highlightColor === color.key ? `ring-2 ring-offset-1 ${color.activeClassName}` : ""}`}
                        title={`Stabilo ${color.label}`}
                        aria-label={`Stabilo ${color.label}`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={highlightSelection}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-200 text-amber-900 text-xs font-semibold rounded-md hover:bg-amber-300 transition"
                    onMouseDown={(e) => e.preventDefault()}
                    title="Blok teks di catatan, pilih warna, lalu klik untuk menstabilo"
                  >
                    <Highlighter className="w-4 h-4" />
                    Stabilo
                  </button>
                  <button
                    type="button"
                    onClick={handleAiAssist}
                    disabled={aiLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 disabled:opacity-60 disabled:cursor-wait transition"
                    title="Merapikan catatan, meringkas poin penting, dan mengambil tugas dengan AI"
                  >
                    <Sparkles className="w-4 h-4" />
                    {aiLoading ? "AI..." : "Bantu AI"}
                  </button>
                </div>
              </div>
              <div
                ref={notesRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => setForm({ ...form, notes: e.currentTarget.innerHTML })}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData("text/plain");
                  document.execCommand("insertText", false, text);
                }}
                className="meeting-note-editor w-full min-h-[360px] px-4 py-3 text-sm leading-7 outline-none resize-y overflow-auto bg-[linear-gradient(#fff_31px,#eef2f7_32px)] bg-[length:100%_32px] text-gray-800"
                data-placeholder={"Tulis catatan seperti di buku rapat...\A\AContoh:\A- Pembahasan stok dashboard\A- Kendala packing hari ini\A- Follow-up marketplace\A\AEnter untuk turun baris. Tab akan pindah ke field berikutnya."}
              />
            </div>

            {aiResult && (
              <div className="border border-blue-100 bg-blue-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-950">
                  <Sparkles className="w-4 h-4" />
                  Hasil Bantuan AI
                </div>
                {aiResult.summary && <p className="text-sm text-blue-900 leading-6">{aiResult.summary}</p>}
                {aiResult.important_points.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-blue-800 mb-1">Poin penting</div>
                    <ul className="space-y-1 text-sm text-blue-900">
                      {aiResult.important_points.map((point, index) => <li key={index}>- {point}</li>)}
                    </ul>
                  </div>
                )}
                {aiResult.action_items.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-blue-800 mb-1">Tugas yang terdeteksi</div>
                    <div className="flex flex-wrap gap-2">
                      {aiResult.action_items.map((item, index) => (
                        <span key={index} className="px-2 py-1 bg-white border border-blue-100 rounded-md text-xs text-blue-900">
                          {item.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={applyAiNotes}
                    className="px-3 py-1.5 bg-white text-blue-700 border border-blue-200 text-xs font-semibold rounded-md hover:bg-blue-100 transition"
                  >
                    Pakai Catatan Rapi
                  </button>
                  <button
                    type="button"
                    onClick={applyAiActions}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 transition"
                  >
                    Masukkan ke Catatan Kerja
                  </button>
                </div>
              </div>
            )}

            <div className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Tugas Lanjutan dari Rapat</div>
                  <div className="text-xs text-gray-400">Isi jika ada pekerjaan yang harus dikerjakan setelah rapat</div>
                </div>
                <button type="button" onClick={addActionItem} className="text-xs font-medium text-blue-600 hover:text-blue-700">Tambah</button>
              </div>
              <div className="space-y-2">
                {actionItems.map((item, index) => (
                  <div key={index} className="grid md:grid-cols-[1fr_130px_130px_118px_96px_32px] gap-2 items-center">
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => updateAction(index, { title: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="contoh: Cek ulang stok produk"
                    />
                    <input
                      type="text"
                      value={item.assigned_to}
                      onChange={(e) => updateAction(index, { assigned_to: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="PIC"
                    />
                    <select
                      value={item.priority}
                      onChange={(e) => updateAction(index, { priority: e.target.value as ActionForm["priority"] })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="low">Rendah</option>
                      <option value="normal">Normal</option>
                      <option value="high">Penting</option>
                    </select>
                    <input
                      type="date"
                      value={item.due_date}
                      onChange={(e) => updateAction(index, { due_date: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={item.create_note}
                        onChange={(e) => updateAction(index, { create_note: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      Catatan
                    </label>
                    <button type="button" onClick={() => removeActionItem(index)} className="p-2 text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">Simpan Rapat</button>
              <button onClick={resetForm} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition">Batal</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-gray-900">Buku Rapat</div>
            <div className="text-xs text-gray-500">Pilih bulan untuk membuka catatan rapat lama</div>
          </div>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="space-y-2">
        {meetings.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
            <NotebookPen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400">Belum ada catatan rapat pada bulan ini</p>
          </div>
        ) : (
          meetings.map((meeting) => (
            <MeetingRow
              key={meeting.id}
              meeting={meeting}
              expanded={expandedId === meeting.id}
              deleting={deleting === meeting.id}
              onExpand={() => setExpandedId(expandedId === meeting.id ? null : meeting.id)}
              onActionStatus={(action) => updateActionStatus(meeting.id, action)}
              onAskDelete={() => setDeleting(meeting.id)}
              onCancelDelete={() => setDeleting(null)}
              onDelete={() => handleDelete(meeting.id)}
            />
          ))
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function MeetingRow({
  meeting,
  expanded,
  deleting,
  onExpand,
  onActionStatus,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  meeting: Meeting;
  expanded: boolean;
  deleting: boolean;
  onExpand: () => void;
  onActionStatus: (action: MeetingAction) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const completedActions = meeting.action_items.filter((item) => item.status === "completed").length;
  const highlights = countHighlights(meeting.notes);
  const preview = stripHtml((meeting.notes || "").replace(/==(?:(?:yellow|red|green):)?([\s\S]+?)==/g, "$1")).split("\n").find((line) => line.trim()) || "Belum ada isi catatan";

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <button onClick={onExpand} className="w-full p-4 text-left hover:bg-gray-50 transition">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">{meeting.title}</h3>
              {meeting.store_name && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: (meeting.store_color || "#64748b") + "20", color: meeting.store_color || undefined }}>
                  {meeting.store_name}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-400">
              <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{formatDate(meeting.meeting_date)}</span>
              {meeting.participants && <span className="flex items-center gap-1"><UsersRound className="w-3 h-3" />{meeting.participants}</span>}
            </div>
            <p className="text-sm text-gray-500 mt-2 truncate">{preview}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center min-w-[150px]">
            <SmallCounter label="Stabilo" value={highlights} />
            <SmallCounter label="Tugas" value={`${completedActions}/${meeting.action_items.length}`} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4 animate-fade-in">
          <div className="rounded-lg border border-yellow-100 bg-yellow-50/40 p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Catatan Rapat</h4>
            <HighlightedNote text={meeting.notes || ""} />
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Tugas Lanjutan</h4>
            {meeting.action_items.length === 0 ? (
              <div className="text-sm text-gray-400">Tidak ada tugas lanjutan</div>
            ) : (
              <div className="space-y-2">
                {meeting.action_items.map((action) => {
                  const done = action.status === "completed";
                  return (
                    <div key={action.id} className="flex items-start gap-3 bg-gray-50 rounded-md p-3">
                      <button onClick={() => onActionStatus(action)} className={done ? "text-green-600" : "text-gray-400"}>
                        {done ? <CheckCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${done ? "text-gray-400 line-through" : "text-gray-900"}`}>{action.title}</div>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-400">
                          {action.assigned_to && <span>PIC: {action.assigned_to}</span>}
                          {action.due_date && <span>Deadline: {formatDate(action.due_date)}</span>}
                          {action.task_id && <span>Masuk Tasks #{action.task_id}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-50">
            <div className="text-[10px] text-gray-300">Dicatat oleh {meeting.created_by_name || "User"}</div>
            {deleting ? (
              <div className="flex gap-2">
                <button onClick={onDelete} className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-md">Hapus</button>
                <button onClick={onCancelDelete} className="px-3 py-1.5 bg-gray-200 text-gray-600 text-xs font-medium rounded-md">Batal</button>
              </div>
            ) : (
              <button onClick={onAskDelete} className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-md hover:bg-red-100 transition">Hapus</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HighlightedNote({ text }: { text: string }) {
  if (!text.trim()) return <p className="text-sm text-gray-400">Belum ada isi catatan</p>;
  return <div className="meeting-note-read whitespace-pre-wrap text-sm leading-7 text-gray-700" dangerouslySetInnerHTML={{ __html: renderMeetingNoteHtml(text) }} />;
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">{icon}{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}

function SmallCounter({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-50 rounded-md px-2 py-1.5">
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className="text-sm font-bold text-gray-900">{value}</div>
    </div>
  );
}
