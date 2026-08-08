import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery, pgOne } from "@/lib/pg";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "waktu_saya")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const week = searchParams.get("week");

  if (hasPostgres()) {
    if (week) {
      const row = await pgOne(
        "SELECT * FROM hn_weekly_review WHERE user_id = $1 AND week_start = $2",
        [session.id, week]
      );
      return NextResponse.json(row || null);
    }
    const result = await pgQuery(
      "SELECT * FROM hn_weekly_review WHERE user_id = $1 ORDER BY week_start DESC LIMIT 52",
      [session.id]
    );
    return NextResponse.json(result.rows);
  }

  const db = getDb();
  if (week) {
    const row = db.prepare("SELECT * FROM weekly_review WHERE user_id = ? AND week_start = ?").get(session.id, week);
    return NextResponse.json(row || null);
  }
  return NextResponse.json(
    db.prepare("SELECT * FROM weekly_review WHERE user_id = ? ORDER BY week_start DESC LIMIT 52").all(session.id)
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "waktu_saya")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { week_start, went_well, energy_drain, to_delegate, wins, energy_score, focus_score, notes } = body;
  if (!week_start) return NextResponse.json({ error: "week_start wajib" }, { status: 400 });

  if (hasPostgres()) {
    const row = await pgOne(
      `INSERT INTO hn_weekly_review (user_id, week_start, went_well, energy_drain, to_delegate, wins, energy_score, focus_score, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id, week_start) DO UPDATE SET
         went_well=$3, energy_drain=$4, to_delegate=$5, wins=$6, energy_score=$7, focus_score=$8, notes=$9, updated_at=now()
       RETURNING id`,
      [session.id, week_start, went_well || null, energy_drain || null, to_delegate || null, wins || null,
       energy_score || null, focus_score || null, notes || null]
    );
    return NextResponse.json({ id: row.id });
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM weekly_review WHERE user_id = ? AND week_start = ?").get(session.id, week_start) as { id: number } | undefined;
  if (existing) {
    db.prepare(
      `UPDATE weekly_review SET went_well=?, energy_drain=?, to_delegate=?, wins=?, energy_score=?, focus_score=?, notes=?, updated_at=datetime('now')
       WHERE id=?`
    ).run(went_well || null, energy_drain || null, to_delegate || null, wins || null, energy_score || null, focus_score || null, notes || null, existing.id);
    return NextResponse.json({ id: existing.id });
  }
  const info = db.prepare(
    `INSERT INTO weekly_review (user_id, week_start, went_well, energy_drain, to_delegate, wins, energy_score, focus_score, notes)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(session.id, week_start, went_well || null, energy_drain || null, to_delegate || null, wins || null, energy_score || null, focus_score || null, notes || null);
  return NextResponse.json({ id: info.lastInsertRowid });
}
