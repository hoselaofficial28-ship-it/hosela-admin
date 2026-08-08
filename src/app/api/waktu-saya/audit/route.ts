import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery, pgOne } from "@/lib/pg";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "waktu_saya")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (hasPostgres()) {
    if (date) {
      const result = await pgQuery(
        `SELECT * FROM hn_time_audit WHERE user_id = $1 AND date = $2 ORDER BY sort_order, created_at`,
        [session.id, date]
      );
      return NextResponse.json(result.rows);
    }
    if (from && to) {
      const result = await pgQuery(
        `SELECT * FROM hn_time_audit WHERE user_id = $1 AND date >= $2 AND date <= $3 ORDER BY date DESC, sort_order, created_at`,
        [session.id, from, to]
      );
      return NextResponse.json(result.rows);
    }
    const result = await pgQuery(
      `SELECT * FROM hn_time_audit WHERE user_id = $1 ORDER BY date DESC, sort_order, created_at LIMIT 200`,
      [session.id]
    );
    return NextResponse.json(result.rows);
  }

  const db = getDb();
  if (date) {
    return NextResponse.json(
      db.prepare("SELECT * FROM time_audit WHERE user_id = ? AND date = ? ORDER BY sort_order, created_at").all(session.id, date)
    );
  }
  if (from && to) {
    return NextResponse.json(
      db.prepare("SELECT * FROM time_audit WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date DESC, sort_order, created_at").all(session.id, from, to)
    );
  }
  return NextResponse.json(
    db.prepare("SELECT * FROM time_audit WHERE user_id = ? ORDER BY date DESC, sort_order, created_at LIMIT 200").all(session.id)
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "waktu_saya")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { date, task_name, energy, value, notes } = await req.json();
  if (!task_name?.trim() || !date) return NextResponse.json({ error: "Task dan tanggal wajib diisi" }, { status: 400 });

  if (hasPostgres()) {
    const row = await pgOne(
      `INSERT INTO hn_time_audit (user_id, date, task_name, energy, value, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [session.id, date, task_name, energy || "took", value || "$", notes || null]
    );
    return NextResponse.json({ id: row.id });
  }

  const db = getDb();
  const info = db.prepare(
    "INSERT INTO time_audit (user_id, date, task_name, energy, value, notes) VALUES (?,?,?,?,?,?)"
  ).run(session.id, date, task_name, energy || "took", value || "$", notes || null);
  return NextResponse.json({ id: info.lastInsertRowid });
}
