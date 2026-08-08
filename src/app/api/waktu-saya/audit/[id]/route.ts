import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery } from "@/lib/pg";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "waktu_saya")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { task_name, energy, value, notes } = body;

  if (hasPostgres()) {
    await pgQuery(
      `UPDATE hn_time_audit SET task_name=$1, energy=$2, value=$3, notes=$4 WHERE id=$5 AND user_id=$6`,
      [task_name, energy, value, notes || null, id, session.id]
    );
    return NextResponse.json({ success: true });
  }

  const db = getDb();
  db.prepare("UPDATE time_audit SET task_name=?, energy=?, value=?, notes=? WHERE id=? AND user_id=?")
    .run(task_name, energy, value, notes || null, id, session.id);
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "waktu_saya")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (hasPostgres()) {
    await pgQuery("DELETE FROM hn_time_audit WHERE id=$1 AND user_id=$2", [id, session.id]);
    return NextResponse.json({ success: true });
  }

  const db = getDb();
  db.prepare("DELETE FROM time_audit WHERE id=? AND user_id=?").run(id, session.id);
  return NextResponse.json({ success: true });
}
