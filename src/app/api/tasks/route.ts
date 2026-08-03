import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery, pgTransaction } from "@/lib/pg";
import { sendTaskEmail } from "@/lib/email";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "tasks")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  if (hasPostgres()) {
    const params: string[] = [];
    let where = "WHERE 1=1";
    if (status && status !== "all") {
      params.push(status);
      where += ` AND t.status = $${params.length}`;
    }

    const tasks = await pgQuery(`
      SELECT t.*, s.short_name as store_name, s.color as store_color
      FROM hn_tasks t
      LEFT JOIN hn_stores s ON t.store_id = s.id
      ${where}
      ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
        t.deadline ASC NULLS LAST,
        t.created_at DESC
    `, params);

    return NextResponse.json(tasks.rows);
  }

  const db = getDb();
  let query = `
    SELECT t.*, s.short_name as store_name, s.color as store_color
    FROM tasks t
    LEFT JOIN stores s ON t.store_id = s.id
    WHERE 1=1
  `;
  const params: string[] = [];

  if (status && status !== "all") {
    query += " AND t.status = ?";
    params.push(status);
  }

  query += " ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, t.deadline ASC NULLS LAST, t.created_at DESC";

  const tasks = db.prepare(query).all(...params);
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "tasks")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title, description, assigned_to, priority, deadline, reminder_at, store_id } = await req.json();

  if (!title) {
    return NextResponse.json({ error: "Judul tugas wajib diisi" }, { status: 400 });
  }

  const notePriority = priority === "urgent" ? "high" : priority === "low" || priority === "normal" || priority === "high" ? priority : "normal";

  if (hasPostgres()) {
    const taskId = await pgTransaction(async (client) => {
      const result = await client.query<{ id: number }>(`
        INSERT INTO hn_tasks (title, description, assigned_to, priority, deadline, reminder_at, store_id, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [title, description || null, assigned_to || null, priority || "normal", deadline || null, reminder_at || null, store_id || null, session.username]);

      const id = result.rows[0].id;
      if (assigned_to) {
        const target = await client.query<{ id: number; email: string | null }>(
          "SELECT id, email FROM hn_users WHERE name = $1 AND status = 'active' LIMIT 1",
          [assigned_to]
        );
        if (target.rows.length > 0) {
          const userId = target.rows[0].id;
          const msg = deadline
            ? `Tugas "${title}" ditugaskan kepada Anda — deadline ${deadline}`
            : `Tugas "${title}" ditugaskan kepada Anda`;
          await client.query(
            "INSERT INTO hn_notifications (user_id, task_id, title, message) VALUES ($1, $2, $3, $4)",
            [userId, id, "Tugas Baru", msg]
          );

          const noteDesc = description
            ? `Tugas dari ${session.name}: ${description}`
            : `Tugas dari ${session.name}`;
          await client.query(`
            INSERT INTO hn_admin_notes (user_id, title, description, priority, due_date, store_id, task_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [userId, title, noteDesc, notePriority, deadline || null, store_id || null, id]);

          if (target.rows[0].email) {
            sendTaskEmail(target.rows[0].email, title, session.name, deadline || undefined, description || undefined).catch(() => {});
          }
        }
      }
      return id;
    });

    return NextResponse.json({ id: taskId });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO tasks (title, description, assigned_to, priority, deadline, reminder_at, store_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || null, assigned_to || null, priority || "normal", deadline || null, reminder_at || null, store_id || null, session.username);

  const taskId = result.lastInsertRowid;

  if (assigned_to) {
    const target = db.prepare("SELECT id, email FROM users WHERE name = ? AND status = 'active' LIMIT 1").get(assigned_to) as { id: number; email: string | null } | undefined;
    if (target) {
      const msg = deadline
        ? `Tugas "${title}" ditugaskan kepada Anda — deadline ${deadline}`
        : `Tugas "${title}" ditugaskan kepada Anda`;
      db.prepare("INSERT INTO notifications (user_id, task_id, title, message) VALUES (?, ?, ?, ?)").run(target.id, taskId, "Tugas Baru", msg);

      const noteDesc = description
        ? `Tugas dari ${session.name}: ${description}`
        : `Tugas dari ${session.name}`;
      db.prepare(`
        INSERT INTO admin_notes (user_id, title, description, priority, due_date, store_id, task_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(target.id, title, noteDesc, notePriority, deadline || null, store_id || null, taskId);

      if (target.email) {
        sendTaskEmail(target.email, title, session.name, deadline || undefined, description || undefined).catch(() => {});
      }
    }
  }

  return NextResponse.json({ id: taskId });
}
