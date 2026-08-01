import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasPostgres, pgQuery } from "@/lib/pg";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await req.json();

  if (hasPostgres()) {
    if (id === "all") {
      await pgQuery("UPDATE hn_notifications SET read = 1 WHERE user_id = $1", [session.id]);
    } else {
      await pgQuery("UPDATE hn_notifications SET read = 1 WHERE id = $1 AND user_id = $2", [id, session.id]);
    }

    return NextResponse.json({ success: true });
  }

  const db = getDb();
  if (id === "all") {
    db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(session.id);
  } else {
    db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?").run(id, session.id);
  }

  return NextResponse.json({ success: true });
}
