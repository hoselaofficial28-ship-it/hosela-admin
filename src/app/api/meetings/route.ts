import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery, pgTransaction } from "@/lib/pg";

interface ActionInput {
  title: string;
  assigned_to?: string;
  due_date?: string;
  create_task?: boolean;
  create_note?: boolean;
  priority?: "low" | "normal" | "high";
  description?: string;
}

interface ActionRow {
  id: number;
  meeting_id: number;
  title: string;
  assigned_to: string | null;
  due_date: string | null;
  status: "pending" | "in_progress" | "completed";
  task_id: number | null;
  note_id: number | null;
}

interface MeetingRow {
  id: number;
  title: string;
  meeting_date: string;
  participants: string | null;
  agenda: string | null;
  notes: string | null;
  decisions: string | null;
  important_points: string | null;
  store_id: number | null;
  store_name: string | null;
  store_color: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "rapat")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");

  if (hasPostgres()) {
    const params: (string | number)[] = [];
    let where = "WHERE 1=1";
    if (session.role !== "owner") {
      params.push(session.id);
      where += ` AND m.created_by = $${params.length}`;
    }
    if (month) {
      params.push(month);
      where += ` AND substring(m.meeting_date from 1 for 7) = $${params.length}`;
    }

    const meetings = await pgQuery<MeetingRow>(`
      SELECT
        m.*,
        s.short_name as store_name,
        s.color as store_color,
        COALESCE(u.name, u.username) as created_by_name
      FROM hn_meetings m
      LEFT JOIN hn_stores s ON m.store_id = s.id
      LEFT JOIN hn_users u ON m.created_by = u.id
      ${where}
      ORDER BY m.meeting_date DESC, m.created_at DESC
    `, params);

    if (meetings.rows.length === 0) return NextResponse.json([]);

    const actions = await pgQuery<ActionRow>(`
      SELECT id, meeting_id, title, assigned_to, due_date, status, task_id, note_id
      FROM hn_meeting_action_items
      WHERE meeting_id = ANY($1::int[])
      ORDER BY status ASC, due_date ASC NULLS LAST, id ASC
    `, [meetings.rows.map((m) => m.id)]);

    return NextResponse.json(meetings.rows.map((meeting) => ({
      ...meeting,
      action_items: actions.rows.filter((action) => action.meeting_id === meeting.id),
    })));
  }

  const db = getDb();
  let query = `
    SELECT
      m.*,
      s.short_name as store_name,
      s.color as store_color,
      COALESCE(u.name, u.username) as created_by_name
    FROM meetings m
    LEFT JOIN stores s ON m.store_id = s.id
    LEFT JOIN users u ON m.created_by = u.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (session.role !== "owner") {
    query += " AND m.created_by = ?";
    params.push(session.id);
  }

  if (month) {
    query += " AND substr(m.meeting_date, 1, 7) = ?";
    params.push(month);
  }

  query += " ORDER BY m.meeting_date DESC, m.created_at DESC";

  const meetings = db.prepare(query).all(...params) as MeetingRow[];
  const actions = db.prepare(`
    SELECT id, meeting_id, title, assigned_to, due_date, status, task_id, note_id
    FROM meeting_action_items
    WHERE meeting_id IN (${meetings.map(() => "?").join(",") || "NULL"})
    ORDER BY status ASC, due_date ASC NULLS LAST, id ASC
  `).all(...meetings.map((m) => m.id)) as ActionRow[];

  return NextResponse.json(meetings.map((meeting) => ({
    ...meeting,
    action_items: actions.filter((action) => action.meeting_id === meeting.id),
  })));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "rapat")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const {
    title,
    meeting_date,
    participants,
    agenda,
    notes,
    decisions,
    important_points,
    store_id,
    action_items,
  } = await req.json() as {
    title?: string;
    meeting_date?: string;
    participants?: string;
    agenda?: string;
    notes?: string;
    decisions?: string;
    important_points?: string;
    store_id?: number | null;
    action_items?: ActionInput[];
  };

  if (!title || !meeting_date) {
    return NextResponse.json({ error: "Judul dan tanggal rapat wajib diisi" }, { status: 400 });
  }

  if (hasPostgres()) {
    const meetingId = await pgTransaction(async (client) => {
      const result = await client.query<{ id: number }>(`
        INSERT INTO hn_meetings (
          title, meeting_date, participants, agenda, notes, decisions,
          important_points, store_id, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [
        title,
        meeting_date,
        participants || null,
        agenda || null,
        notes || null,
        decisions || null,
        important_points || null,
        store_id || null,
        session.id,
      ]);

      const id = result.rows[0].id;
      for (const item of action_items || []) {
        const actionTitle = item.title?.trim();
        if (!actionTitle) continue;

        let taskId: number | null = null;
        if (item.create_task) {
          const task = await client.query<{ id: number }>(`
            INSERT INTO hn_tasks (title, description, assigned_to, priority, deadline, store_id, created_by)
            VALUES ($1, $2, $3, 'normal', $4, $5, $6)
            RETURNING id
          `, [actionTitle, `Dari rapat: ${title}`, item.assigned_to || null, item.due_date || null, store_id || null, session.username]);
          taskId = task.rows[0].id;
        }

        let noteId: number | null = null;
        if (item.create_note) {
          const note = await client.query<{ id: number }>(`
            INSERT INTO hn_admin_notes (user_id, title, description, priority, due_date, store_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
          `, [
            session.id,
            actionTitle,
            item.description || `Dari rapat: ${title}`,
            item.priority || "normal",
            item.due_date || null,
            store_id || null,
          ]);
          noteId = note.rows[0].id;
        }

        await client.query(`
          INSERT INTO hn_meeting_action_items (meeting_id, title, assigned_to, due_date, task_id, note_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [id, actionTitle, item.assigned_to || null, item.due_date || null, taskId, noteId]);
      }

      return id;
    });

    return NextResponse.json({ id: meetingId });
  }

  const db = getDb();
  const insertMeeting = db.prepare(`
    INSERT INTO meetings (
      title, meeting_date, participants, agenda, notes, decisions,
      important_points, store_id, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAction = db.prepare(`
    INSERT INTO meeting_action_items (meeting_id, title, assigned_to, due_date, task_id, note_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertTask = db.prepare(`
    INSERT INTO tasks (title, description, assigned_to, priority, deadline, store_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertNote = db.prepare(`
    INSERT INTO admin_notes (user_id, title, description, priority, due_date, store_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const saveMeeting = db.transaction(() => {
    const result = insertMeeting.run(
      title,
      meeting_date,
      participants || null,
      agenda || null,
      notes || null,
      decisions || null,
      important_points || null,
      store_id || null,
      session.id,
    );
    const meetingId = Number(result.lastInsertRowid);

    for (const item of action_items || []) {
      const actionTitle = item.title?.trim();
      if (!actionTitle) continue;

      let taskId: number | null = null;
      if (item.create_task) {
        const task = insertTask.run(
          actionTitle,
          `Dari rapat: ${title}`,
          item.assigned_to || null,
          "normal",
          item.due_date || null,
          store_id || null,
          session.username,
        );
        taskId = Number(task.lastInsertRowid);
      }

      let noteId: number | null = null;
      if (item.create_note) {
        const noteResult = insertNote.run(
          session.id,
          actionTitle,
          item.description || `Dari rapat: ${title}`,
          item.priority || "normal",
          item.due_date || null,
          store_id || null,
        );
        noteId = Number(noteResult.lastInsertRowid);
      }

      insertAction.run(meetingId, actionTitle, item.assigned_to || null, item.due_date || null, taskId, noteId);
    }

    return meetingId;
  });

  return NextResponse.json({ id: saveMeeting() });
}
