import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery } from "@/lib/pg";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "lab_riset")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  if (hasPostgres()) {
    if (body.status && Object.keys(body).length === 1) {
      const ownerScope = session.role === "owner" ? "" : "AND user_id = $3";
      const p: unknown[] = [body.status, id];
      if (session.role !== "owner") p.push(session.id);
      await pgQuery(`UPDATE hn_lab_riset SET status = $1, updated_at = now() WHERE id = $2 ${ownerScope}`, p);
      return NextResponse.json({ success: true });
    }

    const { title, hypothesis, method, result, conclusion, status, category, store_id, cost, start_date, end_date, tags } = body;
    const ownerScope = session.role === "owner" ? "" : "AND user_id = $14";
    const p: unknown[] = [
      title, hypothesis || null, method || null, result || null, conclusion || null,
      status || "planning", category || "other", store_id || null, cost || null,
      start_date || null, end_date || null, tags || null, id,
    ];
    if (session.role !== "owner") p.push(session.id);

    await pgQuery(`
      UPDATE hn_lab_riset SET title = $1, hypothesis = $2, method = $3, result = $4,
      conclusion = $5, status = $6, category = $7, store_id = $8, cost = $9,
      start_date = $10, end_date = $11, tags = $12, updated_at = now()
      WHERE id = $13 ${ownerScope}
    `, p);
    return NextResponse.json({ success: true });
  }

  const db = getDb();
  if (body.status && Object.keys(body).length === 1) {
    const scope = session.role === "owner" ? "" : "AND user_id = ?";
    const p: unknown[] = [body.status, id];
    if (session.role !== "owner") p.push(session.id);
    db.prepare(`UPDATE lab_riset SET status = ?, updated_at = datetime('now') WHERE id = ? ${scope}`).run(...p);
    return NextResponse.json({ success: true });
  }

  const { title, hypothesis, method, result, conclusion, status, category, store_id, cost, start_date, end_date, tags } = body;
  const scope = session.role === "owner" ? "" : "AND user_id = ?";
  const p: unknown[] = [
    title, hypothesis || null, method || null, result || null, conclusion || null,
    status || "planning", category || "other", store_id || null, cost || null,
    start_date || null, end_date || null, tags || null, id,
  ];
  if (session.role !== "owner") p.push(session.id);

  db.prepare(`
    UPDATE lab_riset SET title = ?, hypothesis = ?, method = ?, result = ?,
    conclusion = ?, status = ?, category = ?, store_id = ?, cost = ?,
    start_date = ?, end_date = ?, tags = ?, updated_at = datetime('now')
    WHERE id = ? ${scope}
  `).run(...p);
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "lab_riset")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  if (hasPostgres()) {
    if (session.role === "owner") {
      await pgQuery("DELETE FROM hn_lab_riset WHERE id = $1", [id]);
    } else {
      await pgQuery("DELETE FROM hn_lab_riset WHERE id = $1 AND user_id = $2", [id, session.id]);
    }
    return NextResponse.json({ success: true });
  }

  const db = getDb();
  if (session.role === "owner") {
    db.prepare("DELETE FROM lab_riset WHERE id = ?").run(id);
  } else {
    db.prepare("DELETE FROM lab_riset WHERE id = ? AND user_id = ?").run(id, session.id);
  }
  return NextResponse.json({ success: true });
}
