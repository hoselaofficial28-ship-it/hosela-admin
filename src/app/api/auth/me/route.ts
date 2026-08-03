import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { getDb } from "@/lib/db";
import { getSession, getUserPermissions, type SessionUser } from "@/lib/auth";
import { hasPostgres, pgOne, pgQuery } from "@/lib/pg";

const JWT_SECRET = process.env.JWT_SECRET || "hosela-admin-secret-key-2026";

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let switchedFrom: { name: string; id: number } | null = null;
  try {
    const cookieStore = await cookies();
    const ownerToken = cookieStore.get("hosela_owner_session")?.value;
    if (ownerToken) {
      const owner = jwt.verify(ownerToken, JWT_SECRET) as SessionUser;
      if (owner.id !== user.id) {
        switchedFrom = { name: owner.name, id: owner.id };
      }
    }
  } catch {}


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

      return NextResponse.json({ user: { ...freshUser, permissions }, switchedFrom });
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
      switchedFrom,
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
      switchedFrom,
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
    switchedFrom,
  });
}
