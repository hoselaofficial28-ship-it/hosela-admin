import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { DEPARTMENTS, FEATURES } from "@/lib/permissions";
import { hasPostgres, pgQuery } from "@/lib/pg";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (hasPostgres()) {
    const users = await pgQuery<{
      id: number;
      username: string;
      role: string;
      department: string | null;
      status: string;
      name: string | null;
      email: string | null;
      created_at: string;
    }>(`
      SELECT id, username, role, department, status, name, email, created_at
      FROM hn_users
      ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END,
        CASE status WHEN 'active' THEN 0 ELSE 1 END,
        created_at DESC
    `);

    const permissions = await pgQuery<{ user_id: number; feature: string; allowed: number }>(
      "SELECT user_id, feature, allowed FROM hn_user_permissions"
    );

    return NextResponse.json({
      departments: DEPARTMENTS,
      features: FEATURES,
      users: users.rows.map((user) => ({
        ...user,
        permissions: permissions.rows
          .filter((permission) => permission.user_id === user.id && permission.allowed)
          .map((permission) => permission.feature),
      })),
    });
  }

  const db = getDb();
  const users = db.prepare(`
    SELECT id, username, role, department, status, name, email, created_at
    FROM users
    ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END,
      CASE status WHEN 'active' THEN 0 ELSE 1 END,
      created_at DESC
  `).all() as {
    id: number;
    username: string;
    role: string;
    department: string | null;
    status: string;
    name: string | null;
    email: string | null;
    created_at: string;
  }[];

  const permissions = db.prepare(`
    SELECT user_id, feature, allowed FROM user_permissions
  `).all() as { user_id: number; feature: string; allowed: number }[];

  return NextResponse.json({
    departments: DEPARTMENTS,
    features: FEATURES,
    users: users.map((user) => ({
      ...user,
      permissions: permissions
        .filter((permission) => permission.user_id === user.id && permission.allowed)
        .map((permission) => permission.feature),
    })),
  });
}
