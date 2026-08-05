import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery } from "@/lib/pg";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "catatan")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  if (hasPostgres()) {
    const ownerScope = session.role === "owner" ? "" : "AND user_id = $4";
    if (body.status) {
      const params: (string | number)[] = [body.status, body.status, id];
      if (session.role !== "owner") params.push(session.id);
      await pgQuery(`
        UPDATE hn_admin_notes SET status = $1, updated_at = now(),
        completed_at = CASE WHEN $2 = 'completed' THEN now()::text ELSE completed_at END
        WHERE id = $3 ${ownerScope}
      `, params);

      await pgQuery(`
        UPDATE hn_meeting_action_items SET status = $1,
        completed_at = CASE WHEN $2 = 'completed' THEN now()::text ELSE completed_at END
        WHERE note_id = $3
      `, [body.status, body.status, id]);

      await pgQuery(`
        UPDATE hn_tasks SET status = $1, updated_at = now(),
        completed_at = CASE WHEN $2 = 'completed' THEN now()::text ELSE completed_at END
        WHERE id = (SELECT task_id FROM hn_admin_notes WHERE id = $3 AND task_id IS NOT NULL)
      `, [body.status, body.status, id]);

      return NextResponse.json({ success: true });
    }

    const { title, description, priority, due_date, store_id } = body;
    const params: (string | number | null)[] = [title, description || null, priority || "normal", due_date || null, store_id || null, id];
    const scope = session.role === "owner" ? "" : "AND user_id = $7";
    if (session.role !== "owner") params.push(session.id);
    await pgQuery(`
      UPDATE hn_admin_notes SET title = $1, description = $2, priority = $3,
      due_date = $4, store_id = $5, updated_at = now()
      WHERE id = $6 ${scope}
    `, params);

    return NextResponse.json({ success: true });
  }

  const db = getDb();
  if (body.status) {
    db.prepare(`
      UPDATE admin_notes SET status = ?, updated_at = datetime('now'),
      completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
      WHERE id = ? AND user_id = ?
    `).run(body.status, body.status, id, session.id);

    db.prepare(`
      UPDATE meeting_action_items SET status = ?,
      completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
      WHERE note_id = ?
    `).run(body.status, body.status, id);

    const note = db.prepare("SELECT task_id FROM admin_notes WHERE id = ? AND task_id IS NOT NULL").get(id) as { task_id: number } | undefined;
    if (note) {
      db.prepare(`
        UPDATE tasks SET status = ?, updated_at = datetime('now'),
        completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
        WHERE id = ?
      `).run(body.status, body.status, note.task_id);
    }

    return NextResponse.json({ success: true });
  }

  const { title, description, priority, due_date, store_id } = body;
  db.prepare(`
    UPDATE admin_notes SET title = ?, description = ?, priority = ?,
    due_date = ?, store_id = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(title, description || null, priority || "normal", due_date || null, store_id || null, id, session.id);

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "catatan")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (hasPostgres()) {
    await pgQuery("UPDATE hn_meeting_action_items SET note_id = NULL WHERE note_id = $1", [id]);
    if (session.role === "owner") {
      await pgQuery("DELETE FROM hn_admin_notes WHERE id = $1", [id]);
    } else {
      await pgQuery("DELETE FROM hn_admin_notes WHERE id = $1 AND user_id = $2", [id, session.id]);
    }
    return NextResponse.json({ success: true });
  }

  const db = getDb();
  db.prepare("UPDATE meeting_action_items SET note_id = NULL WHERE note_id = ?").run(id);
  if (session.role === "owner") {
    db.prepare("DELETE FROM admin_notes WHERE id = ?").run(id);
  } else {
    db.prepare("DELETE FROM admin_notes WHERE id = ? AND user_id = ?").run(id, session.id);
  }
  return NextResponse.json({ success: true });
}
