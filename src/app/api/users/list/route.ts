import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasPostgres, pgQuery } from "@/lib/pg";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (hasPostgres()) {
    const users = await pgQuery<{ id: number; name: string; username: string; role: string }>(
      "SELECT id, name, username, role FROM hn_users WHERE status = 'active' ORDER BY name ASC"
    );
    return NextResponse.json(users.rows);
  }

  const db = getDb();
  const users = db.prepare(
    "SELECT id, name, username, role FROM users WHERE status = 'active' ORDER BY name ASC"
  ).all() as { id: number; name: string; username: string; role: string }[];

  return NextResponse.json(users);
}
