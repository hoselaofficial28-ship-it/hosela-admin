import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgOne, pgQuery } from "@/lib/pg";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "catatan")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const month = searchParams.get("month");
  const scope = searchParams.get("scope");

  if (hasPostgres()) {
    const params: (string | number)[] = [];
    let where = "WHERE 1=1";
    if (session.role !== "owner") {
      params.push(session.id);
      where += ` AND n.user_id = $${params.length}`;
    }
    if (status && status !== "all") {
      params.push(status);
      where += ` AND n.status = $${params.length}`;
    }
    if (scope === "history") {
      where += " AND n.status = 'completed'";
    }
    if (month) {
      params.push(month);
      where += ` AND to_char(COALESCE(n.completed_at::timestamptz, n.updated_at, n.created_at), 'YYYY-MM') = $${params.length}`;
    }

    const notes = await pgQuery(`
      SELECT n.*, s.short_name as store_name, s.color as store_color, u.name as user_name
      FROM hn_admin_notes n
      LEFT JOIN hn_stores s ON n.store_id = s.id
      LEFT JOIN hn_users u ON n.user_id = u.id
      ${where}
      ORDER BY CASE n.status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 WHEN 'completed' THEN 2 END,
        n.due_date ASC NULLS LAST,
        n.created_at DESC
    `, params);

    return NextResponse.json(notes.rows);
  }

  const db = getDb();
  let query = `
    SELECT n.*, s.short_name as store_name, s.color as store_color, u.name as user_name
    FROM admin_notes n
    LEFT JOIN stores s ON n.store_id = s.id
    LEFT JOIN users u ON n.user_id = u.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (session.role !== "owner") {
    query += " AND n.user_id = ?";
    params.push(session.id);
  }

  if (status && status !== "all") {
    query += " AND n.status = ?";
    params.push(status);
  }

  if (scope === "history") {
    query += " AND n.status = 'completed'";
  }

  if (month) {
    query += " AND substr(COALESCE(n.completed_at, n.updated_at, n.created_at), 1, 7) = ?";
    params.push(month);
  }

  query += " ORDER BY CASE n.status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 WHEN 'completed' THEN 2 END, n.due_date ASC NULLS LAST, n.created_at DESC";

  const notes = db.prepare(query).all(...params);
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "catatan")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title, description, priority, due_date, store_id } = await req.json();

  if (!title) {
    return NextResponse.json({ error: "Judul catatan wajib diisi" }, { status: 400 });
  }

  if (hasPostgres()) {
    const result = await pgOne<{ id: number }>(`
      INSERT INTO hn_admin_notes (user_id, title, description, priority, due_date, store_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [session.id, title, description || null, priority || "normal", due_date || null, store_id || null]);

    return NextResponse.json({ id: result.id });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO admin_notes (user_id, title, description, priority, due_date, store_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(session.id, title, description || null, priority || "normal", due_date || null, store_id || null);

  return NextResponse.json({ id: result.lastInsertRowid });
}
