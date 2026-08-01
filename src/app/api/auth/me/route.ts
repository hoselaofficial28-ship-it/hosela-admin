import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession, getUserPermissions } from "@/lib/auth";
import { hasPostgres, pgOne, pgQuery } from "@/lib/pg";

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (hasPostgres()) {
    const freshUser = await pgOne<{
      id: number;
      username: string;
      role: string;
      department: string | null;
      status: string;
      name: string;
      email: string | null;
    }>(`
      SELECT id, username, role, department, status, name, email
      FROM hn_users WHERE id = $1
    `, [user.id]);

    if (freshUser) {
      if (freshUser.status !== "active") {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }

      const permissions = freshUser.role === "owner"
        ? ["dashboard", "input", "history", "tasks", "catatan", "rapat", "settings", "users"]
        : (await pgQuery<{ feature: string }>(
          "SELECT feature FROM hn_user_permissions WHERE user_id = $1 AND allowed = 1",
          [freshUser.id]
        )).rows.map((permission) => permission.feature);

      return NextResponse.json({ user: { ...freshUser, permissions } });
    }

    if (user.status === "inactive") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        department: user.department || null,
        status: user.status || "active",
        name: user.name,
        permissions: user.permissions || [],
      },
    });
  }

  const db = getDb();
  const freshUser = db.prepare(`
    SELECT id, username, role, department, status, name, email
    FROM users WHERE id = ?
  `).get(user.id) as {
    id: number;
    username: string;
    role: string;
    department: string | null;
    status: string;
    name: string;
    email: string | null;
  } | undefined;

  if (freshUser) {
    if (freshUser.status !== "active") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({
      user: {
        ...freshUser,
        permissions: freshUser.role === "owner" ? ["dashboard", "input", "history", "tasks", "catatan", "rapat", "settings", "users"] : getUserPermissions(freshUser.id),
      },
    });
  }

  if (user.status === "inactive") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      department: user.department || null,
      status: user.status || "active",
      name: user.name,
      permissions: user.permissions || [],
    },
  });
}
