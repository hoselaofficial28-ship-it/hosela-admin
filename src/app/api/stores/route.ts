import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgOne, pgQuery } from "@/lib/pg";

export async function GET() {
  if (hasPostgres()) {
    const stores = await pgQuery("SELECT * FROM hn_stores ORDER BY sort_order");
    return NextResponse.json(stores.rows);
  }

  const db = getDb();
  const stores = db.prepare("SELECT * FROM stores ORDER BY sort_order").all();
  return NextResponse.json(stores);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "settings")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, short_name, color } = await req.json();

  if (!name || !short_name || !color) {
    return NextResponse.json({ error: "Semua field wajib diisi" }, { status: 400 });
  }

  if (hasPostgres()) {
    const maxOrder = await pgOne<{ max: number }>("SELECT COALESCE(MAX(sort_order), 0) as max FROM hn_stores");
    const result = await pgOne<{ id: number }>(`
      INSERT INTO hn_stores (name, short_name, color, sort_order)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [name, short_name, color, Number(maxOrder?.max || 0) + 1]);

    return NextResponse.json({ id: result.id, name, short_name, color });
  }

  const db = getDb();
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) as max FROM stores").get() as { max: number };

  const result = db.prepare(
    "INSERT INTO stores (name, short_name, color, sort_order) VALUES (?, ?, ?, ?)"
  ).run(name, short_name, color, maxOrder.max + 1);

  return NextResponse.json({ id: result.lastInsertRowid, name, short_name, color });
}
