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
      where += ` AND e.end_date >= $${params.length}`;
    }
    if (end) {
      params.push(end);
      where += ` AND e.start_date <= $${params.length}`;
    }
    if (storeId) {
      params.push(Number(storeId));
      where += ` AND e.store_id = $${params.length}`;
    }

    const rows = await pgQuery(`
      SELECT e.*, s.short_name as store_name, s.color as store_color, s.sort_order
      FROM hn_express_shipments e
      JOIN hn_stores s ON e.store_id = s.id
      ${where}
      ORDER BY e.start_date DESC, s.sort_order ASC
    `, params);
    return NextResponse.json(rows.rows);
  }

  const params: (string | number)[] = [];
  let query = `
    SELECT e.*, s.short_name as store_name, s.color as store_color, s.sort_order
    FROM express_shipments e
    JOIN stores s ON e.store_id = s.id
    WHERE 1=1
  `;
  if (start) {
    query += " AND e.end_date >= ?";
    params.push(start);
  }
  if (end) {
    query += " AND e.start_date <= ?";
    params.push(end);
  }
  if (storeId) {
    query += " AND e.store_id = ?";
    params.push(Number(storeId));
  }
  query += " ORDER BY e.start_date DESC, s.sort_order ASC";

  return NextResponse.json(getDb().prepare(query).all(...params));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "input")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { store_id, start_date, end_date, quantity, notes } = await req.json() as {
    store_id?: number;
    start_date?: string;
    end_date?: string;
    quantity?: number;
    notes?: string;
  };

  if (!store_id || !start_date || !end_date || Number(quantity) <= 0) {
    return NextResponse.json({ error: "Toko, periode, dan total barang wajib diisi" }, { status: 400 });
  }

  const safeQuantity = Math.max(0, Number(quantity) || 0);
  if (hasPostgres()) {
    const result = await pgOne<{ id: number }>(`
      INSERT INTO hn_express_shipments (store_id, start_date, end_date, quantity, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [store_id, start_date, end_date, safeQuantity, notes || null]);
    return NextResponse.json({ id: result.id });
  }

  const result = getDb().prepare(`
    INSERT INTO express_shipments (store_id, start_date, end_date, quantity, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(store_id, start_date, end_date, safeQuantity, notes || null);

  return NextResponse.json({ id: result.lastInsertRowid });
}
