import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgOne, pgQuery } from "@/lib/pg";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "input") && !canAccessFeature(session, "history") && !canAccessFeature(session, "dashboard")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const storeId = searchParams.get("store_id");

  if (hasPostgres()) {
    const params: (string | number)[] = [];
    let where = "WHERE 1=1";
    if (start) {
      params.push(start);
      where += ` AND p.date >= $${params.length}`;
    }
    if (end) {
      params.push(end);
      where += ` AND p.date <= $${params.length}`;
    }
    if (storeId) {
      params.push(Number(storeId));
      where += ` AND p.store_id = $${params.length}`;
    }

    const rows = await pgQuery(`
      SELECT p.*, s.short_name as store_name, s.color as store_color, s.sort_order
      FROM hn_order_peak_times p
      JOIN hn_stores s ON p.store_id = s.id
      ${where}
      ORDER BY p.date DESC, p.start_time ASC, s.sort_order ASC
    `, params);
    return NextResponse.json(rows.rows);
  }

  const params: (string | number)[] = [];
  let query = `
    SELECT p.*, s.short_name as store_name, s.color as store_color, s.sort_order
    FROM order_peak_times p
    JOIN stores s ON p.store_id = s.id
    WHERE 1=1
  `;
  if (start) {
    query += " AND p.date >= ?";
    params.push(start);
  }
  if (end) {
    query += " AND p.date <= ?";
    params.push(end);
  }
  if (storeId) {
    query += " AND p.store_id = ?";
    params.push(Number(storeId));
  }
  query += " ORDER BY p.date DESC, p.start_time ASC, s.sort_order ASC";

  return NextResponse.json(getDb().prepare(query).all(...params));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "input")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { date, store_id, start_time, end_time, order_count, notes } = await req.json() as {
    date?: string;
    store_id?: number;
    start_time?: string;
    end_time?: string;
    order_count?: number;
    notes?: string;
  };

  if (!date || !store_id || !start_time || !end_time) {
    return NextResponse.json({ error: "Tanggal, toko, jam mulai, dan jam selesai wajib diisi" }, { status: 400 });
  }

  const count = Math.max(0, Number(order_count ?? 0) || 0);
  if (hasPostgres()) {
    const result = await pgOne<{ id: number }>(`
      INSERT INTO hn_order_peak_times (date, store_id, start_time, end_time, order_count, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [date, store_id, start_time, end_time, count, notes || null, session.username]);
    return NextResponse.json({ id: result.id });
  }

  const result = getDb().prepare(`
    INSERT INTO order_peak_times (date, store_id, start_time, end_time, order_count, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(date, store_id, start_time, end_time, count, notes || null, session.username);

  return NextResponse.json({ id: result.lastInsertRowid });
}
