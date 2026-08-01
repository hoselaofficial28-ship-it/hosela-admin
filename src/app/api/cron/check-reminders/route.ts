import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sendReminderEmail } from "@/lib/email";
import { hasPostgres, pgQuery } from "@/lib/pg";

export async function GET() {
  const now = new Date().toISOString().slice(0, 16);

  if (hasPostgres()) {
    const dueTasks = await pgQuery<{ id: number; title: string; description: string; deadline: string; email: string; user_name: string; user_id: number; reminder_at: string }>(`
      SELECT t.*, u.email, u.name as user_name, u.id as user_id
      FROM hn_tasks t
      CROSS JOIN hn_users u
      WHERE t.status != 'completed'
        AND t.reminder_at IS NOT NULL
        AND t.reminder_at <= $1
        AND t.reminder_sent = 0
    `, [now]);

    let sent = 0;
    const taskIds = new Set<number>();

    for (const task of dueTasks.rows) {
      if (task.email) {
        await sendReminderEmail(task.email, task.title, task.deadline, task.description);
      }

      await pgQuery(
        "INSERT INTO hn_notifications (user_id, task_id, title, message) VALUES ($1, $2, $3, $4)",
        [task.user_id, task.id, "Pengingat Deadline", `Tugas "${task.title}" mendekati deadline: ${task.deadline}`]
      );

      taskIds.add(task.id);
      sent++;
    }

    for (const taskId of taskIds) {
      await pgQuery("UPDATE hn_tasks SET reminder_sent = 1 WHERE id = $1", [taskId]);
    }

    return NextResponse.json({ checked: dueTasks.rows.length, sent });
  }

  const db = getDb();
  const dueTasks = db.prepare(`
    SELECT t.*, u.email, u.name as user_name, u.id as user_id
    FROM tasks t
    CROSS JOIN users u
    WHERE t.status != 'completed'
      AND t.reminder_at IS NOT NULL
      AND t.reminder_at <= ?
      AND t.reminder_sent = 0
  `).all(now) as { id: number; title: string; description: string; deadline: string; email: string; user_name: string; user_id: number; reminder_at: string }[];

  let sent = 0;
  const taskIds = new Set<number>();

  for (const task of dueTasks) {
    if (task.email) {
      await sendReminderEmail(task.email, task.title, task.deadline, task.description);
    }

    db.prepare("INSERT INTO notifications (user_id, task_id, title, message) VALUES (?, ?, ?, ?)").run(
      task.user_id,
      task.id,
      "Pengingat Deadline",
      `Tugas "${task.title}" mendekati deadline: ${task.deadline}`
    );

    taskIds.add(task.id);
    sent++;
  }

  for (const taskId of taskIds) {
    db.prepare("UPDATE tasks SET reminder_sent = 1 WHERE id = ?").run(taskId);
  }

  return NextResponse.json({ checked: dueTasks.length, sent });
}
