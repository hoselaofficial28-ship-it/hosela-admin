import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { seedHistoricalData } from "@/lib/seed-history";
import { hasPostgres, pgQuery, pgTransaction } from "@/lib/pg";

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Hanya owner yang dapat menghapus data riwayat" }, { status: 403 });

  const { date, store_id } = await req.json() as { date: string; store_id?: number };
  if (!date) return NextResponse.json({ error: "Tanggal wajib diisi" }, { status: 400 });

  if (hasPostgres()) {
    if (store_id) {
      await pgQuery("DELETE FROM hn_daily_shipments WHERE date = $1 AND store_id = $2", [date, store_id]);
    } else {
      await pgQuery("DELETE FROM hn_daily_shipments WHERE date = $1", [date]);
    }
    return NextResponse.json({ success: true });
  }

  const db = getDb();
  if (store_id) {
    db.prepare("DELETE FROM daily_shipments WHERE date = ? AND store_id = ?").run(date, store_id);
  } else {
    db.prepare("DELETE FROM daily_shipments WHERE date = ?").run(date);
  }
  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (
    !canAccessFeature(session, "dashboard") &&
    !canAccessFeature(session, "history") &&
    !canAccessFeature(session, "input")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");
  const storeId = searchParams.get("store_id");
  const date = searchParams.get("date");

  if (hasPostgres()) {
    const params: (string | number)[] = [];
    let where = "WHERE 1=1";

    if (date) {
      params.push(date);
      where += ` AND ds.date = $${params.length}`;
    } else {
      if (startDate) {
        params.push(startDate);
        where += ` AND ds.date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        where += ` AND ds.date <= $${params.length}`;
      }
      if (storeId) {
        params.push(Number(storeId));
        where += ` AND ds.store_id = $${params.length}`;
      }
    }

    const rows = await pgQuery(`
      SELECT ds.*, s.short_name, s.color, s.sort_order
      FROM hn_daily_shipments ds
      JOIN hn_stores s ON ds.store_id = s.id
      ${where}
      ORDER BY ds.date ASC, s.sort_order ASC
    `, params);

    return NextResponse.json(rows.rows);
  }

  const db = getDb();
  seedHistoricalData();

  if (date) {
    const rows = db.prepare(`
      SELECT ds.*, s.short_name, s.color, s.sort_order
      FROM daily_shipments ds
      JOIN stores s ON ds.store_id = s.id
      WHERE ds.date = ?
      ORDER BY s.sort_order
    `).all(date);
    return NextResponse.json(rows);
  }

  let query = `
    SELECT ds.date, ds.quantity, ds.store_id, s.short_name, s.color, s.sort_order
    FROM daily_shipments ds
    JOIN stores s ON ds.store_id = s.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (startDate) {
    query += " AND ds.date >= ?";
    params.push(startDate);
  }
  if (endDate) {
    query += " AND ds.date <= ?";
    params.push(endDate);
  }
  if (storeId) {
    query += " AND ds.store_id = ?";
    params.push(Number(storeId));
  }

  query += " ORDER BY ds.date ASC, s.sort_order ASC";

  const rows = db.prepare(query).all(...params);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canAccessFeature(session, "input")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { date, shipments } = await req.json() as {
    date: string;
    shipments: {
      store_id: number;
      quantity?: number;
      morning_quantity?: number;
      afternoon_quantity?: number;
    }[];
  };

  if (!date || !shipments || !Array.isArray(shipments)) {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }

  if (hasPostgres()) {
    await pgTransaction(async (client) => {
      for (const s of shipments) {
        const morning = Math.max(0, Number(s.morning_quantity ?? 0) || 0);
        const afternoon = Math.max(0, Number(s.afternoon_quantity ?? 0) || 0);
        const total = morning + afternoon || Math.max(0, Number(s.quantity ?? 0) || 0);

        await client.query(`
          INSERT INTO hn_daily_shipments (date, store_id, morning_quantity, afternoon_quantity, quantity, created_by)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT(date, store_id) DO UPDATE SET
            morning_quantity = EXCLUDED.morning_quantity,
            afternoon_quantity = EXCLUDED.afternoon_quantity,
            quantity = EXCLUDED.quantity,
            updated_at = now()
        `, [date, s.store_id, morning, afternoon, total, session.username]);
      }
    });

    return NextResponse.json({ success: true });
  }

  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO daily_shipments (date, store_id, morning_quantity, afternoon_quantity, quantity, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, store_id) DO UPDATE SET
      morning_quantity = excluded.morning_quantity,
      afternoon_quantity = excluded.afternoon_quantity,
      quantity = excluded.quantity,
      updated_at = datetime('now')
  `);

  const insertAll = db.transaction(() => {
    for (const s of shipments) {
      const morning = Math.max(0, Number(s.morning_quantity ?? 0) || 0);
      const afternoon = Math.max(0, Number(s.afternoon_quantity ?? 0) || 0);
      const total = morning + afternoon || Math.max(0, Number(s.quantity ?? 0) || 0);
      upsert.run(date, s.store_id, morning, afternoon, total, session.username);
    }
  });

  insertAll();
  return NextResponse.json({ success: true });
}
