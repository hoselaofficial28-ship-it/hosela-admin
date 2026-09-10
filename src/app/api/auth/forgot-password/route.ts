import { randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { normalizeUsername } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendPasswordResetCodeEmail } from "@/lib/email";
import { hasPostgres, pgOne, pgQuery } from "@/lib/pg";
import bcrypt from "bcryptjs";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createResetCode() {
  return randomInt(100000, 1000000).toString();
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    step: "request_code" | "reset";
    username?: string;
    email?: string;
    code?: string;
    newPassword?: string;
  };

  const username = typeof body.username === "string" ? normalizeUsername(body.username) : "";
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";

  if (body.step === "request_code") {
    if (!username || !email) {
      return NextResponse.json({ error: "Username dan Gmail terdaftar wajib diisi" }, { status: 400 });
    }

    let user: { id: number; name: string | null; email: string | null } | null = null;

    if (hasPostgres()) {
      user = await pgOne<{ id: number; name: string | null; email: string | null }>(
        "SELECT id, name, email FROM hn_users WHERE lower(trim(username)) = $1 AND COALESCE(status, 'active') = 'active'",
        [username]
      );
    } else {
      const db = getDb();
      user = db.prepare(
        "SELECT id, name, email FROM users WHERE LOWER(TRIM(username)) = ? AND COALESCE(status, 'active') = 'active'"
      ).get(username) as typeof user;
    }

    if (!user) {
      return NextResponse.json({ error: "Username tidak ditemukan" }, { status: 404 });
    }

    if (!user.email) {
      return NextResponse.json({ error: "Akun ini belum punya Gmail terdaftar. Minta owner tambahkan Gmail akun dulu." }, { status: 400 });
    }

    if (normalizeEmail(user.email) !== email) {
      return NextResponse.json({ error: "Gmail tidak cocok dengan akun ini" }, { status: 400 });
    }

    const code = createResetCode();
    const codeHash = bcrypt.hashSync(code, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    if (hasPostgres()) {
      await pgQuery(
        "UPDATE hn_users SET password_reset_code_hash = $1, password_reset_expires_at = $2 WHERE id = $3",
        [codeHash, expiresAt, user.id]
      );
    } else {
      const db = getDb();
      db.prepare(
        "UPDATE users SET password_reset_code_hash = ?, password_reset_expires_at = ? WHERE id = ?"
      ).run(codeHash, expiresAt, user.id);
    }

    const sent = await sendPasswordResetCodeEmail(user.email, user.name, code);
    if (!sent) {
      return NextResponse.json({ error: "Email reset belum terkirim. Cek konfigurasi SMTP di server." }, { status: 500 });
    }

    return NextResponse.json({ success: true, name: user.name, message: "Kode reset sudah dikirim ke Gmail terdaftar." });
  }

  if (body.step === "reset") {
    const code = typeof body.code === "string" ? body.code.trim() : "";

    if (!username || !email || !code || !body.newPassword) {
      return NextResponse.json({ error: "Username, Gmail, kode, dan password baru wajib diisi" }, { status: 400 });
    }

    if (body.newPassword.length < 6) {
      return NextResponse.json({ error: "Password baru minimal 6 karakter" }, { status: 400 });
    }

    let user: { id: number; email: string | null; password_reset_code_hash: string | null; password_reset_expires_at: string | null } | null = null;

    if (hasPostgres()) {
      user = await pgOne<{ id: number; email: string | null; password_reset_code_hash: string | null; password_reset_expires_at: string | null }>(
        "SELECT id, email, password_reset_code_hash, password_reset_expires_at FROM hn_users WHERE lower(trim(username)) = $1 AND COALESCE(status, 'active') = 'active'",
        [username]
      );
    } else {
      const db = getDb();
      user = db.prepare(
        "SELECT id, email, password_reset_code_hash, password_reset_expires_at FROM users WHERE LOWER(TRIM(username)) = ? AND COALESCE(status, 'active') = 'active'"
      ).get(username) as typeof user;
    }

    if (!user || !user.email || normalizeEmail(user.email) !== email) {
      return NextResponse.json({ error: "Data akun tidak cocok" }, { status: 400 });
    }

    if (!user.password_reset_code_hash || !user.password_reset_expires_at) {
      return NextResponse.json({ error: "Minta kode reset dulu" }, { status: 400 });
    }

    if (new Date(user.password_reset_expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Kode reset sudah kedaluwarsa. Minta kode baru." }, { status: 400 });
    }

    if (!bcrypt.compareSync(code, user.password_reset_code_hash)) {
      return NextResponse.json({ error: "Kode reset salah" }, { status: 400 });
    }

    const hash = bcrypt.hashSync(body.newPassword, 10);

    if (hasPostgres()) {
      await pgQuery(
        "UPDATE hn_users SET password_hash = $1, password_reset_code_hash = NULL, password_reset_expires_at = NULL WHERE id = $2",
        [hash, user.id]
      );
    } else {
      const db = getDb();
      db.prepare(
        "UPDATE users SET password_hash = ?, password_reset_code_hash = NULL, password_reset_expires_at = NULL WHERE id = ?"
      ).run(hash, user.id);
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Step tidak valid" }, { status: 400 });
}
