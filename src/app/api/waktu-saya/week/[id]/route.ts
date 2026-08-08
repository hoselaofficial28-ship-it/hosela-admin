import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery } from "@/lib/pg";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "waktu_saya")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { day_of_week, start_time, end_time, label, block_type } = await req.json();

  if (hasPostgres()) {
    await pgQuery(
      `UPDATE hn_perfect_week SET day_of_week=$1, start_time=$2, end_time=$3, label=$4, block_type=$5, updated_at=now()
       WHERE id=$6 AND user_id=$7`,
      [day_of_week, start_time, end_time, label, block_type, id, session.id]
    );
    return NextResponse.json({ success: true });
  }

  const db = getDb();
  db.prepare(
    "UPDATE perfect_week SET day_of_week=?, start_time=?, end_time=?, label=?, block_type=?, updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(day_of_week, start_time, end_time, label, block_type, id, session.id);
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "waktu_saya")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (hasPostgres()) {
    await pgQuery("DELETE FROM hn_perfect_week WHERE id=$1 AND user_id=$2", [id, session.id]);
    return NextResponse.json({ success: true });
  }

  const db = getDb();
  db.prepare("DELETE FROM perfect_week WHERE id=? AND user_id=?").run(id, session.id);
  return NextResponse.json({ success: true });
}
