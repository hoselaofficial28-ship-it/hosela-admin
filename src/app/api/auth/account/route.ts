import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasPostgres, pgOne, pgQuery } from "@/lib/pg";
import bcrypt from "bcryptjs";

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json() as {
    action: "change_password" | "change_pin";
    currentPassword?: string;
    newPassword?: string;
    newPin?: string;
  };

  if (body.action === "change_password") {
    if (!body.currentPassword || !body.newPassword) {
      return NextResponse.json({ error: "Password lama dan baru wajib diisi" }, { status: 400 });
    }
    if (body.newPassword.length < 6) {
      return NextResponse.json({ error: "Password baru minimal 6 karakter" }, { status: 400 });
    }

    if (hasPostgres()) {
      const user = await pgOne<{ password_hash: string }>(
        "SELECT password_hash FROM hn_users WHERE id = $1", [session.id]
      );
      if (!user || !bcrypt.compareSync(body.currentPassword, user.password_hash)) {
        return NextResponse.json({ error: "Password lama salah" }, { status: 400 });
      }
      const hash = bcrypt.hashSync(body.newPassword, 10);
      await pgQuery("UPDATE hn_users SET password_hash = $1 WHERE id = $2", [hash, session.id]);
    } else {
      const db = getDb();
      const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(session.id) as { password_hash: string } | undefined;
      if (!user || !bcrypt.compareSync(body.currentPassword, user.password_hash)) {
        return NextResponse.json({ error: "Password lama salah" }, { status: 400 });
      }
      const hash = bcrypt.hashSync(body.newPassword, 10);
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, session.id);
    }

    return NextResponse.json({ success: true });
  }

  if (body.action === "change_pin") {
    if (!body.newPin) {
      return NextResponse.json({ error: "PIN wajib diisi" }, { status: 400 });
    }
    if (!/^\d{4,6}$/.test(body.newPin)) {
      return NextResponse.json({ error: "PIN harus 4-6 digit angka" }, { status: 400 });
    }

    const pinHash = bcrypt.hashSync(body.newPin, 10);

    if (hasPostgres()) {
      await pgQuery("UPDATE hn_users SET pin_hash = $1 WHERE id = $2", [pinHash, session.id]);
    } else {
      const db = getDb();
      db.prepare("UPDATE users SET pin_hash = ? WHERE id = ?").run(pinHash, session.id);
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Action tidak valid" }, { status: 400 });
}
