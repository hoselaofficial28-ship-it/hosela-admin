import { NextRequest, NextResponse } from "next/server";
import { canAccessFeature, getSession } from "@/lib/auth";

interface AiActionItem {
  title: string;
  assigned_to?: string | null;
  due_date?: string | null;
  priority?: "low" | "normal" | "high";
  description?: string | null;
}

interface AiMeetingResult {
  polished_notes: string;
  summary: string;
  important_points: string[];
  action_items: AiActionItem[];
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || content;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("DeepSeek tidak mengembalikan JSON yang valid");
  }
  return JSON.parse(raw.slice(start, end + 1)) as Partial<AiMeetingResult>;
}

function normalizeResult(result: Partial<AiMeetingResult>): AiMeetingResult {
  const normalizePriority = (priority: unknown): AiActionItem["priority"] => (
    priority === "low" || priority === "high" ? priority : "normal"
  );

  return {
    polished_notes: String(result.polished_notes || "").trim(),
    summary: String(result.summary || "").trim(),
    important_points: Array.isArray(result.important_points)
      ? result.important_points.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12)
      : [],
    action_items: Array.isArray(result.action_items)
      ? result.action_items.map((item) => ({
          title: String(item.title || "").trim(),
          assigned_to: item.assigned_to ? String(item.assigned_to).trim() : null,
          due_date: item.due_date ? String(item.due_date).trim() : null,
          priority: normalizePriority(item.priority),
          description: item.description ? String(item.description).trim() : null,
        })).filter((item) => item.title).slice(0, 10)
      : [],
  };
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "rapat")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY belum diatur di Vercel" }, { status: 500 });
  }

  const { title, meeting_date, participants, notes } = await req.json() as {
    title?: string;
    meeting_date?: string;
    participants?: string;
    notes?: string;
  };

  const plainNotes = stripHtml(notes || "");
  if (!plainNotes) {
    return NextResponse.json({ error: "Isi catatan rapat dulu sebelum memakai AI" }, { status: 400 });
  }

  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  const today = new Date().toISOString().slice(0, 10);

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            "Kamu adalah asisten notulen internal Hosela.",
            "Tugasmu merapikan catatan rapat bahasa Indonesia agar jelas, ringkas, dan operasional.",
            "Ambil pekerjaan penting sebagai action_items hanya jika benar-benar ada tindak lanjut.",
            "Jangan mengarang nama PIC atau tanggal deadline. Jika tidak ada, isi null.",
            "Balas hanya JSON valid tanpa markdown.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            today,
            title: title || null,
            meeting_date: meeting_date || null,
            participants: participants || null,
            notes: plainNotes,
            output_schema: {
              polished_notes: "catatan rapat yang sudah dirapikan, tetap natural seperti buku rapat",
              summary: "ringkasan 2-4 kalimat",
              important_points: ["poin penting"],
              action_items: [
                {
                  title: "judul pekerjaan singkat dan jelas",
                  assigned_to: "PIC kalau disebut, jika tidak null",
                  due_date: "YYYY-MM-DD kalau disebut jelas, jika tidak null",
                  priority: "low | normal | high",
                  description: "detail singkat pekerjaan, jika ada",
                },
              ],
            },
          }),
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: text || "DeepSeek gagal memproses catatan" }, { status: 502 });
  }

  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content || "";
  const result = normalizeResult(extractJson(content));

  return NextResponse.json(result);
}
