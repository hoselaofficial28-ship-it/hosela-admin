import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery } from "@/lib/pg";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "waktu_saya")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { source_week, target_week } = await req.json();
  if (!source_week || !target_week) {
    return NextResponse.json({ error: "source_week dan target_week wajib diisi" }, { status: 400 });
  }

  if (hasPostgres()) {
    const existing = await pgQuery(
      "SELECT COUNT(*) as count FROM hn_perfect_week WHERE user_id = $1 AND week_start = $2",
      [session.id, target_week]
    );
    if (Number(existing.rows[0].count) > 0) {
      return NextResponse.json({ error: "Minggu tujuan sudah memiliki blok" }, { status: 409 });
    }

    await pgQuery(
      `INSERT INTO hn_perfect_week (user_id, day_of_week, start_time, end_time, label, block_type, week_start)
       SELECT user_id, day_of_week, start_time, end_time, label, block_type, $2
       FROM hn_perfect_week WHERE user_id = $1 AND week_start = $3`,
      [session.id, target_week, source_week]
    );
    return NextResponse.json({ success: true });
  }

  const db = getDb();
  const count = db.prepare(
    "SELECT COUNT(*) as count FROM perfect_week WHERE user_id = ? AND week_start = ?"
  ).get(session.id, target_week) as { count: number };
  if (count.count > 0) {
    return NextResponse.json({ error: "Minggu tujuan sudah memiliki blok" }, { status: 409 });
  }

  db.prepare(
    `INSERT INTO perfect_week (user_id, day_of_week, start_time, end_time, label, block_type, week_start)
     SELECT user_id, day_of_week, start_time, end_time, label, block_type, ?
     FROM perfect_week WHERE user_id = ? AND week_start = ?`
  ).run(target_week, session.id, source_week);
  return NextResponse.json({ success: true });
}
