import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { DEPARTMENTS, FEATURES, getDefaultPermissions } from "@/lib/permissions";
import { hasPostgres, pgOne, pgQuery, pgTransaction } from "@/lib/pg";
import bcrypt from "bcryptjs";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const userId = Number(id);
  const body = await req.json() as {
    department?: string;
    status?: string;
    permissions?: string[];
    email?: string | null;
    newPassword?: string;
  };

  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "User tidak valid" }, { status: 400 });
  }

  if (userId === session.id && body.status && body.status !== "active") {
    return NextResponse.json({ error: "Owner tidak bisa menonaktifkan akun sendiri" }, { status: 400 });
  }

  if (body.newPassword) {
    if (body.newPassword.length < 6) {
      return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 });
    }
    const hash = bcrypt.hashSync(body.newPassword, 10);
    if (hasPostgres()) {
      const target = await pgOne<{ id: number }>("SELECT id FROM hn_users WHERE id = $1", [userId]);
      if (!target) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
      await pgQuery("UPDATE hn_users SET password_hash = $1 WHERE id = $2", [hash, userId]);
    } else {
      const db = getDb();
      const target = db.prepare("SELECT id FROM users WHERE id = ?").get(userId) as { id: number } | undefined;
      if (!target) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
    }
    return NextResponse.json({ success: true });
  }

  if (hasPostgres()) {
    const target = await pgOne<{ id: number; role: string }>("SELECT id, role FROM hn_users WHERE id = $1", [userId]);
    if (!target) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });

    if (body.department && !DEPARTMENTS.some((item) => item.key === body.department)) {
      return NextResponse.json({ error: "Bagian tidak valid" }, { status: 400 });
    }

    if (body.status && !["active", "inactive"].includes(body.status)) {
      return NextResponse.json({ error: "Status tidak valid" }, { status: 400 });
    }

    const allowedFeatureKeys = new Set<string>(FEATURES.map((feature) => feature.key));
    const finalPermissions = body.permissions?.filter((permission) => allowedFeatureKeys.has(permission)) ||
      getDefaultPermissions(body.department);

    await pgTransaction(async (client) => {
      await client.query(`
        UPDATE hn_users
        SET department = COALESCE($1, department),
          status = COALESCE($2, status),
          email = $3
        WHERE id = $4
      `, [body.department || null, body.status || null, body.email ?? null, userId]);

      for (const feature of FEATURES) {
        await client.query(`
          INSERT INTO hn_user_permissions (user_id, feature, allowed)
          VALUES ($1, $2, $3)
          ON CONFLICT(user_id, feature) DO UPDATE SET
            allowed = EXCLUDED.allowed,
            updated_at = now()
        `, [userId, feature.key, finalPermissions.includes(feature.key) ? 1 : 0]);
      }
    });

    return NextResponse.json({ success: true });
  }

  const db = getDb();
  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId) as { id: number; role: string } | undefined;
  if (!target) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });

  if (body.department && !DEPARTMENTS.some((department) => department.key === body.department)) {
    return NextResponse.json({ error: "Bagian tidak valid" }, { status: 400 });
  }

  if (body.status && !["active", "inactive"].includes(body.status)) {
    return NextResponse.json({ error: "Status tidak valid" }, { status: 400 });
  }

  const validFeatures = new Set<string>(FEATURES.map((feature) => feature.key));
  const requestedPermissions = (body.permissions || []).filter((permission) => validFeatures.has(permission));
  const finalPermissions = target.role === "owner"
    ? FEATURES.map((feature) => feature.key)
    : requestedPermissions.length > 0
      ? requestedPermissions
      : getDefaultPermissions(body.department);

  const updateUser = db.prepare(`
    UPDATE users
    SET department = COALESCE(?, department),
        status = COALESCE(?, status),
        email = ?
    WHERE id = ?
  `);
  const upsertPermission = db.prepare(`
    INSERT INTO user_permissions (user_id, feature, allowed, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, feature) DO UPDATE SET
      allowed = excluded.allowed,
      updated_at = datetime('now')
  `);

  const save = db.transaction(() => {
    updateUser.run(body.department || null, body.status || null, body.email ?? null, userId);
    for (const feature of FEATURES) {
      upsertPermission.run(userId, feature.key, finalPermissions.includes(feature.key) ? 1 : 0);
    }
  });

  save();
  return NextResponse.json({ success: true });
}
