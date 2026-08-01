import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasPostgres, pgOne, pgQuery } from "@/lib/pg";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (hasPostgres()) {
    const notifications = await pgQuery(`
      SELECT n.*, t.title as task_title, t.status as task_status
      FROM hn_notifications n
      LEFT JOIN hn_tasks t ON n.task_id = t.id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT 50
    `, [session.id]);

    const unreadCount = await pgOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM hn_notifications WHERE user_id = $1 AND read = 0",
      [session.id]
    );

    return NextResponse.json({ notifications: notifications.rows, unreadCount: Number(unreadCount?.count || 0) });
  }

  const db = getDb();
  const notifications = db.prepare(`
    SELECT n.*, t.title as task_title, t.status as task_status
    FROM notifications n
    LEFT JOIN tasks t ON n.task_id = t.id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 50
  `).all(session.id);

  const unreadCount = db.prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0").get(session.id) as { count: number };

  return NextResponse.json({ notifications, unreadCount: unreadCount.count });
}
