import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { hasPostgres, pgOne, pgQuery } from "@/lib/pg";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    step: "verify_user" | "verify_pin" | "reset";
    username?: string;
    pin?: string;
    newPassword?: string;
  };

  if (body.step === "verify_user") {
    if (!body.username) {
      return NextResponse.json({ error: "Username wajib diisi" }, { status: 400 });
    }

    let user: { id: number; name: string | null; pin_hash: string | null } | null = null;

    if (hasPostgres()) {
      user = await pgOne<{ id: number; name: string | null; pin_hash: string | null }>(
        "SELECT id, name, pin_hash FROM hn_users WHERE username = $1 AND status = 'active'",
        [body.username.trim().toLowerCase()]
      );
    } else {
      const db = getDb();
      user = db.prepare(
        "SELECT id, name, pin_hash FROM users WHERE username = ? AND status = 'active'"
      ).get(body.username.trim().toLowerCase()) as typeof user;
    }

    if (!user) {
      return NextResponse.json({ error: "Username tidak ditemukan" }, { status: 404 });
    }

    if (!user.pin_hash) {
      return NextResponse.json({ error: "Akun ini belum memiliki PIN. Hubungi owner untuk reset password." }, { status: 400 });
    }

    return NextResponse.json({ success: true, name: user.name, userId: user.id });
  }

  if (body.step === "verify_pin") {
    if (!body.username || !body.pin) {
      return NextResponse.json({ error: "Username dan PIN wajib diisi" }, { status: 400 });
    }

    let user: { id: number; pin_hash: string | null } | null = null;

    if (hasPostgres()) {
      user = await pgOne<{ id: number; pin_hash: string | null }>(
        "SELECT id, pin_hash FROM hn_users WHERE username = $1 AND status = 'active'",
        [body.username.trim().toLowerCase()]
      );
    } else {
      const db = getDb();
      user = db.prepare(
        "SELECT id, pin_hash FROM users WHERE username = ? AND status = 'active'"
      ).get(body.username.trim().toLowerCase()) as typeof user;
    }

    if (!user || !user.pin_hash) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }

    if (!bcrypt.compareSync(body.pin, user.pin_hash)) {
      return NextResponse.json({ error: "PIN salah" }, { status: 400 });
    }

    return NextResponse.json({ success: true, verified: true });
  }

  if (body.step === "reset") {
    if (!body.username || !body.pin || !body.newPassword) {
      return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 });
    }

    if (body.newPassword.length < 6) {
      return NextResponse.json({ error: "Password baru minimal 6 karakter" }, { status: 400 });
    }

    let user: { id: number; pin_hash: string | null } | null = null;

    if (hasPostgres()) {
      user = await pgOne<{ id: number; pin_hash: string | null }>(
        "SELECT id, pin_hash FROM hn_users WHERE username = $1 AND status = 'active'",
        [body.username.trim().toLowerCase()]
      );
    } else {
      const db = getDb();
      user = db.prepare(
        "SELECT id, pin_hash FROM users WHERE username = ? AND status = 'active'"
      ).get(body.username.trim().toLowerCase()) as typeof user;
    }

    if (!user || !user.pin_hash) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }

    if (!bcrypt.compareSync(body.pin, user.pin_hash)) {
      return NextResponse.json({ error: "PIN salah" }, { status: 400 });
    }

    const hash = bcrypt.hashSync(body.newPassword.toLowerCase(), 10);

    if (hasPostgres()) {
      await pgQuery("UPDATE hn_users SET password_hash = $1 WHERE id = $2", [hash, user.id]);
    } else {
      const db = getDb();
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Step tidak valid" }, { status: 400 });
}
