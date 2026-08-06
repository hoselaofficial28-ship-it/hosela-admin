import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery, pgOne } from "@/lib/pg";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "lab_riset")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";
  const category = searchParams.get("category") || "all";

  if (hasPostgres()) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (session.role !== "owner") {
      conditions.push(`r.user_id = $${idx++}`);
      params.push(session.id);
    }
    if (status !== "all") {
      conditions.push(`r.status = $${idx++}`);
      params.push(status);
    }
    if (category !== "all") {
      conditions.push(`r.category = $${idx++}`);
      params.push(category);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pgQuery(`
      SELECT r.*, u.name as user_name, s.short_name as store_name, s.color as store_color
      FROM hn_lab_riset r
      LEFT JOIN hn_users u ON u.id = r.user_id
      LEFT JOIN hn_stores s ON s.id = r.store_id
      ${where}
      ORDER BY r.created_at DESC
    `, params);

    return NextResponse.json(result.rows);
  }

  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (session.role !== "owner") {
    conditions.push("r.user_id = ?");
    params.push(session.id);
  }
  if (status !== "all") {
    conditions.push("r.status = ?");
    params.push(status);
  }
  if (category !== "all") {
    conditions.push("r.category = ?");
    params.push(category);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT r.*, u.name as user_name, s.short_name as store_name, s.color as store_color
    FROM lab_riset r
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN stores s ON s.id = r.store_id
    ${where}
    ORDER BY r.created_at DESC
  `).all(...params);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "lab_riset")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { title, hypothesis, method, result, conclusion, status, category, store_id, cost, start_date, end_date, tags } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "Judul wajib diisi" }, { status: 400 });
  }

  if (hasPostgres()) {
    const row = await pgOne(
      `INSERT INTO hn_lab_riset (user_id, title, hypothesis, method, result, conclusion, status, category, store_id, cost, start_date, end_date, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [session.id, title, hypothesis || null, method || null, result || null, conclusion || null,
       status || "planning", category || "other", store_id || null, cost || null,
       start_date || null, end_date || null, tags || null]
    );
    return NextResponse.json({ id: row.id });
  }

  const db = getDb();
  const info = db.prepare(
    `INSERT INTO lab_riset (user_id, title, hypothesis, method, result, conclusion, status, category, store_id, cost, start_date, end_date, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(session.id, title, hypothesis || null, method || null, result || null, conclusion || null,
    status || "planning", category || "other", store_id || null, cost || null,
    start_date || null, end_date || null, tags || null);

  return NextResponse.json({ id: info.lastInsertRowid });
}
