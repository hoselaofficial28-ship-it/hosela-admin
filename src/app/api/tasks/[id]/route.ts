import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery, pgTransaction } from "@/lib/pg";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "tasks")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  if (hasPostgres()) {
    if (body.status) {
      await pgTransaction(async (client) => {
        await client.query(`
          UPDATE hn_tasks SET status = $1, updated_at = now(),
          completed_at = CASE WHEN $2 = 'completed' THEN now()::text ELSE completed_at END
          WHERE id = $3
        `, [body.status, body.status, id]);

        if (body.status === "completed") {
          const task = await client.query<{ title: string; assigned_to: string | null; created_by: string | null }>(
            "SELECT title, assigned_to, created_by FROM hn_tasks WHERE id = $1", [id]
          );
          const t = task.rows[0];
          const notifyNames = new Set<string>();
          if (t?.assigned_to) notifyNames.add(t.assigned_to);
          if (t?.created_by) notifyNames.add(t.created_by);
          notifyNames.delete(session.username);
          if (notifyNames.size > 0) {
            const targets = await client.query<{ id: number }>(
              `SELECT id FROM hn_users WHERE (name = ANY($1) OR username = ANY($1)) AND status = 'active'`,
              [Array.from(notifyNames)]
            );
            for (const user of targets.rows) {
              await client.query(
                "INSERT INTO hn_notifications (user_id, task_id, title, message) VALUES ($1, $2, $3, $4)",
                [user.id, id, "Tugas Selesai", `Tugas "${t?.title || "Tugas"}" telah diselesaikan oleh ${session.name}`]
              );
            }
          }
        }
      });

      return NextResponse.json({ success: true });
    }

    const { title, description, assigned_to, priority, deadline, reminder_at, store_id } = body;
    await pgQuery(`
      UPDATE hn_tasks SET title = $1, description = $2, assigned_to = $3, priority = $4,
      deadline = $5, reminder_at = $6, store_id = $7, updated_at = now()
      WHERE id = $8
    `, [title, description || null, assigned_to || null, priority || "normal", deadline || null, reminder_at || null, store_id || null, id]);

    return NextResponse.json({ success: true });
  }

  const db = getDb();
  if (body.status) {
    db.prepare(`
      UPDATE tasks SET status = ?, updated_at = datetime('now'),
      completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
      WHERE id = ?
    `).run(body.status, body.status, id);

    if (body.status === "completed") {
      const task = db.prepare("SELECT title, assigned_to, created_by FROM tasks WHERE id = ?").get(id) as { title: string; assigned_to: string | null; created_by: string | null };
      const notifyNames = new Set<string>();
      if (task.assigned_to) notifyNames.add(task.assigned_to);
      if (task.created_by) notifyNames.add(task.created_by);
      notifyNames.delete(session.username);
      const insertNotif = db.prepare("INSERT INTO notifications (user_id, task_id, title, message) VALUES (?, ?, ?, ?)");
      for (const name of notifyNames) {
        const target = db.prepare("SELECT id FROM users WHERE (name = ? OR username = ?) AND status = 'active' LIMIT 1").get(name, name) as { id: number } | undefined;
        if (target) insertNotif.run(target.id, id, "Tugas Selesai", `Tugas "${task.title}" telah diselesaikan oleh ${session.name}`);
      }
    }

    return NextResponse.json({ success: true });
  }

  const { title, description, assigned_to, priority, deadline, reminder_at, store_id } = body;
  db.prepare(`
    UPDATE tasks SET title = ?, description = ?, assigned_to = ?, priority = ?,
    deadline = ?, reminder_at = ?, store_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(title, description || null, assigned_to || null, priority || "normal", deadline || null, reminder_at || null, store_id || null, id);

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "tasks")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (hasPostgres()) {
    await pgQuery("DELETE FROM hn_notifications WHERE task_id = $1", [id]);
    await pgQuery("DELETE FROM hn_tasks WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  }

  const db = getDb();
  db.prepare("DELETE FROM notifications WHERE task_id = ?").run(id);
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
