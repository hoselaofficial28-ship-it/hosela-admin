import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery } from "@/lib/pg";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "rapat")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  if (hasPostgres()) {
    if (body.action_id && body.status) {
      await pgQuery(`
        UPDATE hn_meeting_action_items
        SET status = $1,
            completed_at = CASE WHEN $2 = 'completed' THEN now()::text ELSE completed_at END
        WHERE id = $3 AND meeting_id = $4
      `, [body.status, body.status, body.action_id, id]);

      if (body.task_id) {
        await pgQuery(`
          UPDATE hn_tasks
          SET status = $1, updated_at = now(),
              completed_at = CASE WHEN $2 = 'completed' THEN now()::text ELSE completed_at END
          WHERE id = $3
        `, [body.status, body.status, body.task_id]);
      }

      return NextResponse.json({ success: true });
    }

    const {
      title,
      meeting_date,
      participants,
      agenda,
      notes,
      decisions,
      important_points,
      store_id,
    } = body;

    if (!title || !meeting_date) {
      return NextResponse.json({ error: "Judul dan tanggal rapat wajib diisi" }, { status: 400 });
    }

    await pgQuery(`
      UPDATE hn_meetings
      SET title = $1, meeting_date = $2, participants = $3, agenda = $4, notes = $5,
          decisions = $6, important_points = $7, store_id = $8, updated_at = now()
      WHERE id = $9
    `, [
      title,
      meeting_date,
      participants || null,
      agenda || null,
      notes || null,
      decisions || null,
      important_points || null,
      store_id || null,
      id,
    ]);

    return NextResponse.json({ success: true });
  }

  const db = getDb();
  if (body.action_id && body.status) {
    db.prepare(`
      UPDATE meeting_action_items
      SET status = ?,
          completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
      WHERE id = ? AND meeting_id = ?
    `).run(body.status, body.status, body.action_id, id);

    if (body.task_id) {
      db.prepare(`
        UPDATE tasks
        SET status = ?, updated_at = datetime('now'),
            completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
        WHERE id = ?
      `).run(body.status, body.status, body.task_id);
    }

    return NextResponse.json({ success: true });
  }

  const {
    title,
    meeting_date,
    participants,
    agenda,
    notes,
    decisions,
    important_points,
    store_id,
  } = body;

  if (!title || !meeting_date) {
    return NextResponse.json({ error: "Judul dan tanggal rapat wajib diisi" }, { status: 400 });
  }

  db.prepare(`
    UPDATE meetings
    SET title = ?, meeting_date = ?, participants = ?, agenda = ?, notes = ?,
        decisions = ?, important_points = ?, store_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title,
    meeting_date,
    participants || null,
    agenda || null,
    notes || null,
    decisions || null,
    important_points || null,
    store_id || null,
    id,
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "rapat")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (hasPostgres()) {
    await pgQuery("DELETE FROM hn_meeting_action_items WHERE meeting_id = $1", [id]);
    await pgQuery("DELETE FROM hn_meetings WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  }

  const db = getDb();
  db.prepare("DELETE FROM meeting_action_items WHERE meeting_id = ?").run(id);
  db.prepare("DELETE FROM meetings WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
