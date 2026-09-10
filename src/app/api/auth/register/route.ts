import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { DEPARTMENTS, getDefaultPermissions } from "@/lib/permissions";
import { COOKIE_NAME, createToken, normalizeUsername } from "@/lib/auth";
import { hasPostgres, pgOne, pgTransaction } from "@/lib/pg";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const { username, password, name, email, department } = await req.json();
  const normalizedUsername = typeof username === "string" ? normalizeUsername(username) : "";
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!normalizedUsername || !password || !name || !normalizedEmail || !department) {
    return NextResponse.json({ error: "Username, password, nama, Gmail, dan bagian wajib diisi" }, { status: 400 });
  }

  if (normalizedUsername.length < 3) {
    return NextResponse.json({ error: "Username minimal 3 karakter" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: "Format Gmail tidak valid" }, { status: 400 });
  }

  if (!DEPARTMENTS.some((item) => item.key === department)) {
    return NextResponse.json({ error: "Bagian tidak valid" }, { status: 400 });
  }

  const hash = bcrypt.hashSync(password, 10);
  const permissions = getDefaultPermissions(department);

  if (hasPostgres()) {
    const existing = await pgOne("SELECT id FROM hn_users WHERE LOWER(username) = $1", [normalizedUsername]);
    if (existing) {
      return NextResponse.json({ error: "Username sudah digunakan" }, { status: 400 });
    }

    const userId = await pgTransaction(async (client) => {
      const result = await client.query<{ id: number }>(`
        INSERT INTO hn_users (username, password_hash, role, department, status, name, email)
        VALUES ($1, $2, 'admin', $3, 'active', $4, $5)
        RETURNING id
      `, [normalizedUsername, hash, department, name, normalizedEmail]);

      const id = result.rows[0].id;
      for (const feature of permissions) {
        await client.query(
          "INSERT INTO hn_user_permissions (user_id, feature, allowed) VALUES ($1, $2, 1)",
          [id, feature]
        );
      }
      return id;
    });

    const user = {
      id: userId,
      username: normalizedUsername,
      role: "admin",
      name,
      department,
      status: "active",
      permissions,
    };

    const response = NextResponse.json({
      success: true,
      message: "Akun berhasil didaftarkan. Silakan masuk.",
      user,
    });

    response.cookies.set(COOKIE_NAME, createToken(user), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  }

  const db = getDb();

  const existing = db.prepare("SELECT id FROM users WHERE LOWER(username) = ?").get(normalizedUsername);
  if (existing) {
    return NextResponse.json({ error: "Username sudah digunakan" }, { status: 400 });
  }

  const result = db.prepare(
    "INSERT INTO users (username, password_hash, role, department, status, name, email) VALUES (?, ?, 'admin', ?, 'active', ?, ?)"
  ).run(normalizedUsername, hash, department, name, normalizedEmail);

  const userId = Number(result.lastInsertRowid);
  const insertPermission = db.prepare(`
    INSERT INTO user_permissions (user_id, feature, allowed) VALUES (?, ?, ?)
  `);
  for (const feature of permissions) {
    insertPermission.run(userId, feature, 1);
  }

  const user = {
    id: userId,
    username: normalizedUsername,
    role: "admin",
    name,
    department,
    status: "active",
    permissions,
  };

  const response = NextResponse.json({
    success: true,
    message: "Akun berhasil didaftarkan. Silakan masuk.",
    user,
  });

  response.cookies.set(COOKIE_NAME, createToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}
