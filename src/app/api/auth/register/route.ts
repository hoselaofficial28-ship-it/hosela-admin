import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { DEPARTMENTS, getDefaultPermissions } from "@/lib/permissions";
import { COOKIE_NAME, createToken } from "@/lib/auth";
import { hasPostgres, pgOne, pgTransaction } from "@/lib/pg";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const username = (body.username || "").trim().toLowerCase();
  const password = (body.password || "").trim();
  const name = (body.name || "").trim();
  const email = (body.email || "").trim();
  const department = (body.department || "").trim();

  if (!username || !password || !name || !department) {
    return NextResponse.json({ error: "Username, password, nama, dan bagian wajib diisi" }, { status: 400 });
  }

  if (username.length < 3) {
    return NextResponse.json({ error: "Username minimal 3 karakter" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 });
  }

  if (!DEPARTMENTS.some((item) => item.key === department)) {
    return NextResponse.json({ error: "Bagian tidak valid" }, { status: 400 });
  }

  const hash = bcrypt.hashSync(password.toLowerCase(), 10);
  const permissions = getDefaultPermissions(department);

  if (hasPostgres()) {
    const existing = await pgOne("SELECT id FROM hn_users WHERE LOWER(username) = LOWER($1)", [username]);
    if (existing) {
      return NextResponse.json({ error: "Username sudah digunakan" }, { status: 400 });
    }

    const userId = await pgTransaction(async (client) => {
      const result = await client.query<{ id: number }>(`
        INSERT INTO hn_users (username, password_hash, role, department, status, name, email)
        VALUES ($1, $2, 'admin', $3, 'active', $4, $5)
        RETURNING id
      `, [username, hash, department, name, email || null]);

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
      username,
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

  const existing = db.prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)").get(username);
  if (existing) {
    return NextResponse.json({ error: "Username sudah digunakan" }, { status: 400 });
  }

  const result = db.prepare(
    "INSERT INTO users (username, password_hash, role, department, status, name, email) VALUES (?, ?, 'admin', ?, 'active', ?, ?)"
  ).run(username, hash, department, name, email || null);

  const userId = Number(result.lastInsertRowid);
  const insertPermission = db.prepare(`
    INSERT INTO user_permissions (user_id, feature, allowed) VALUES (?, ?, ?)
  `);
  for (const feature of permissions) {
    insertPermission.run(userId, feature, 1);
  }

  const user = {
    id: userId,
    username,
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
