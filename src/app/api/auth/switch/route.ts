import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { getSession, createToken, COOKIE_NAME, type SessionUser } from "@/lib/auth";
import { hasPostgres, pgQuery } from "@/lib/pg";
import { getDb } from "@/lib/db";

const OWNER_COOKIE = "hosela_owner_session";
const JWT_SECRET = process.env.JWT_SECRET || "hosela-admin-secret-key-2026";

async function verifyOwnerAccess(): Promise<{ session: SessionUser; isImpersonating: boolean } | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.role === "owner") return { session, isImpersonating: false };

  try {
    const cookieStore = await cookies();
    const ownerToken = cookieStore.get(OWNER_COOKIE)?.value;
    if (ownerToken) {
      const owner = jwt.verify(ownerToken, JWT_SECRET) as SessionUser;
      if (owner.role === "owner") return { session, isImpersonating: true };
    }
  } catch {}

  return null;
}

export async function GET() {
  const access = await verifyOwnerAccess();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (hasPostgres()) {
    const users = await pgQuery<{ id: number; username: string; name: string; role: string; status: string }>(
      "SELECT id, username, name, role, status FROM hn_users WHERE status = 'active' ORDER BY role DESC, name ASC"
    );
    return NextResponse.json(users.rows);
  }

  const db = getDb();
  const users = db.prepare(
    "SELECT id, username, name, role, status FROM users WHERE status = 'active' ORDER BY role DESC, name ASC"
  ).all() as { id: number; username: string; name: string; role: string; status: string }[];

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const access = await verifyOwnerAccess();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { user_id } = await req.json() as { user_id: number };
  if (!user_id) return NextResponse.json({ error: "user_id wajib diisi" }, { status: 400 });

  let targetUser;

  if (hasPostgres()) {
    const row = await pgQuery<{ id: number; username: string; role: string; name: string; department: string | null; status: string }>(
      "SELECT id, username, role, name, department, status FROM hn_users WHERE id = $1 AND status = 'active'",
      [user_id]
    );
    if (row.rows.length === 0) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });

    const u = row.rows[0];
    const perms = await pgQuery<{ feature: string }>(
      "SELECT feature FROM hn_user_permissions WHERE user_id = $1 AND allowed = 1",
      [u.id]
    );
    targetUser = { ...u, permissions: u.role === "owner"
      ? ["dashboard", "input", "history", "tasks", "catatan", "rapat", "settings", "users"]
      : perms.rows.map((p) => p.feature) };
  } else {
    const db = getDb();
    const u = db.prepare("SELECT id, username, role, name, department, status FROM users WHERE id = ? AND status = 'active'")
      .get(user_id) as { id: number; username: string; role: string; name: string; department: string | null; status: string } | undefined;
    if (!u) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });

    const perms = db.prepare("SELECT feature FROM user_permissions WHERE user_id = ? AND allowed = 1")
      .all(u.id) as { feature: string }[];
    targetUser = { ...u, permissions: u.role === "owner"
      ? ["dashboard", "input", "history", "tasks", "catatan", "rapat", "settings", "users"]
      : perms.map((p) => p.feature) };
  }

  const cookieStore = await cookies();
  const ownerToken = cookieStore.get(OWNER_COOKIE)?.value;

  if (targetUser.role === "owner" && ownerToken) {
    cookieStore.set(COOKIE_NAME, ownerToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    cookieStore.delete(OWNER_COOKIE);
  } else {
    const currentToken = cookieStore.get(COOKIE_NAME)?.value;
    if (!ownerToken && currentToken) {
      cookieStore.set(OWNER_COOKIE, currentToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    const newToken = createToken(targetUser);
    cookieStore.set(COOKIE_NAME, newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return NextResponse.json({ success: true, user: { id: targetUser.id, name: targetUser.name, role: targetUser.role } });
}
