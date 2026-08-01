import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery, pgTransaction } from "@/lib/pg";

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

  if (hasPostgres()) {
    const taskId = await pgTransaction(async (client) => {
      const result = await client.query<{ id: number }>(`
        INSERT INTO hn_tasks (title, description, assigned_to, priority, deadline, reminder_at, store_id, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [title, description || null, assigned_to || null, priority || "normal", deadline || null, reminder_at || null, store_id || null, session.username]);

      const id = result.rows[0].id;
      if (deadline) {
        const users = await client.query<{ id: number }>("SELECT id FROM hn_users");
        for (const user of users.rows) {
          await client.query(
            "INSERT INTO hn_notifications (user_id, task_id, title, message) VALUES ($1, $2, $3, $4)",
            [user.id, id, "Tugas Baru", `Tugas "${title}" telah dibuat dengan deadline ${deadline}`]
          );
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

  if (deadline) {
    const users = db.prepare("SELECT id FROM users").all() as { id: number }[];
    const insertNotif = db.prepare("INSERT INTO notifications (user_id, task_id, title, message) VALUES (?, ?, ?, ?)");
    for (const u of users) {
      insertNotif.run(u.id, result.lastInsertRowid, "Tugas Baru", `Tugas "${title}" telah dibuat dengan deadline ${deadline}`);
    }
  }

  return NextResponse.json({ id: result.lastInsertRowid });
}
