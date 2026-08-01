import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgOne, pgQuery } from "@/lib/pg";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "settings")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { name, short_name, color } = await req.json();

  if (!name || !short_name || !color) {
    return NextResponse.json({ error: "Semua field wajib diisi" }, { status: 400 });
  }

  if (hasPostgres()) {
    await pgQuery("UPDATE hn_stores SET name = $1, short_name = $2, color = $3 WHERE id = $4", [name, short_name, color, id]);
    return NextResponse.json({ success: true });
  }

  const db = getDb();
  db.prepare("UPDATE stores SET name = ?, short_name = ?, color = ? WHERE id = ?").run(name, short_name, color, id);
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "settings")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  if (hasPostgres()) {
    const shipmentCount = await pgOne<{ count: string }>("SELECT COUNT(*) as count FROM hn_daily_shipments WHERE store_id = $1", [id]);
    if (Number(shipmentCount?.count || 0) > 0) {
      return NextResponse.json({ error: "Toko ini memiliki data pengiriman. Hapus data pengiriman terlebih dahulu." }, { status: 400 });
    }

    await pgQuery("DELETE FROM hn_stores WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  }

  const db = getDb();
  const shipmentCount = db.prepare("SELECT COUNT(*) as count FROM daily_shipments WHERE store_id = ?").get(id) as { count: number };
  if (shipmentCount.count > 0) {
    return NextResponse.json({ error: "Toko ini memiliki data pengiriman. Hapus data pengiriman terlebih dahulu." }, { status: 400 });
  }

  db.prepare("DELETE FROM stores WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
