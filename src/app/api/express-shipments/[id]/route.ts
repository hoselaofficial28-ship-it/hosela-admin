import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery } from "@/lib/pg";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "input")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (hasPostgres()) {
    await pgQuery("DELETE FROM hn_express_shipments WHERE id = $1", [Number(id)]);
    return NextResponse.json({ success: true });
  }

  getDb().prepare("DELETE FROM express_shipments WHERE id = ?").run(Number(id));
  return NextResponse.json({ success: true });
}
