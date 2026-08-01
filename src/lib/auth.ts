import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { getDb } from "./db";
import bcrypt from "bcryptjs";
import { type FeatureKey } from "./permissions";
import { hasPostgres, pgOne, pgQuery } from "./pg";

const JWT_SECRET = process.env.JWT_SECRET || "hosela-admin-secret-key-2026";
const COOKIE_NAME = "hosela_session";

export interface SessionUser {
  id: number;
  username: string;
  role: string;
  name: string;
  department?: string | null;
  status?: string;
  permissions?: string[];
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as SessionUser;
    return payload;
  } catch {
    return null;
  }
}

export function getUserPermissions(userId: number) {
  if (hasPostgres()) return [];

  const db = getDb();
  const permissions = db.prepare(`
    SELECT feature FROM user_permissions WHERE user_id = ? AND allowed = 1
  `).all(userId) as { feature: string }[];

  return permissions.map((permission) => permission.feature);
}

export function canAccessFeature(user: SessionUser, feature: FeatureKey) {
  if (user.role === "owner") return true;
  if (user.permissions && user.permissions.length > 0) {
    return user.permissions.includes(feature);
  }
  if (hasPostgres()) return false;

  const permissions = getUserPermissions(user.id);
  return permissions.includes(feature);
}

export function createToken(user: SessionUser): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      department: user.department || null,
      status: user.status || "active",
      permissions: user.permissions || [],
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export async function verifyLogin(username: string, password: string): Promise<{ user: SessionUser | null; error?: string }> {
  if (hasPostgres()) {
    const user = await pgOne<{
      id: number;
      username: string;
      password_hash: string;
      role: string;
      name: string;
      department: string | null;
      status: string | null;
    }>("SELECT * FROM hn_users WHERE username = $1", [username]);

    if (!user) return { user: null };
    if (!bcrypt.compareSync(password, user.password_hash)) return { user: null };
    if (user.status === "inactive") return { user: null, error: "Akun kamu sedang dinonaktifkan" };

    const permissions = await pgQuery<{ feature: string }>(
      "SELECT feature FROM hn_user_permissions WHERE user_id = $1 AND allowed = 1",
      [user.id]
    );

    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        department: user.department,
        status: user.status || "active",
        permissions: permissions.rows.map((permission) => permission.feature),
      },
    };
  }

  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as {
    id: number;
    username: string;
    password_hash: string;
    role: string;
    name: string;
    department: string | null;
    status: string | null;
  } | undefined;

  if (!user) return { user: null };
  if (!bcrypt.compareSync(password, user.password_hash)) return { user: null };

  if (user.status === "inactive") {
    return { user: null, error: "Akun kamu sedang dinonaktifkan" };
  }

  const permissions = db.prepare(`
    SELECT feature FROM user_permissions WHERE user_id = ? AND allowed = 1
  `).all(user.id) as { feature: string }[];

  return {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      department: user.department,
      status: user.status || "active",
      permissions: permissions.map((permission) => permission.feature),
    },
  };
}

export { COOKIE_NAME };
