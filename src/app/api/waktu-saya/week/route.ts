import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery, pgOne } from "@/lib/pg";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "waktu_saya")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (hasPostgres()) {
    const result = await pgQuery(
      "SELECT * FROM hn_perfect_week WHERE user_id = $1 ORDER BY day_of_week, start_time",
      [session.id]
    );
    return NextResponse.json(result.rows);
  }

  const db = getDb();
  return NextResponse.json(
    db.prepare("SELECT * FROM perfect_week WHERE user_id = ? ORDER BY day_of_week, start_time").all(session.id)
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "waktu_saya")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { day_of_week, start_time, end_time, label, block_type } = await req.json();
  if (label == null || start_time == null || end_time == null || day_of_week == null) {
    return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 });
  }

  if (hasPostgres()) {
    const row = await pgOne(
      `INSERT INTO hn_perfect_week (user_id, day_of_week, start_time, end_time, label, block_type)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [session.id, day_of_week, start_time, end_time, label, block_type || "focus"]
    );
    return NextResponse.json({ id: row.id });
  }

  const db = getDb();
  const info = db.prepare(
    "INSERT INTO perfect_week (user_id, day_of_week, start_time, end_time, label, block_type) VALUES (?,?,?,?,?,?)"
  ).run(session.id, day_of_week, start_time, end_time, label, block_type || "focus");
  return NextResponse.json({ id: info.lastInsertRowid });
}
