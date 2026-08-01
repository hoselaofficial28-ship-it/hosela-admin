import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { seedHistoricalData } from "@/lib/seed-history";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgOne } from "@/lib/pg";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "dashboard") && !canAccessFeature(session, "history")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");
  const prevStart = searchParams.get("prev_start");
  const prevEnd = searchParams.get("prev_end");
  const storeId = searchParams.get("store_id");

  let whereClause = "WHERE 1=1";
  const params: (string | number)[] = [];

  if (startDate) { whereClause += " AND ds.date >= ?"; params.push(startDate); }
  if (endDate) { whereClause += " AND ds.date <= ?"; params.push(endDate); }
  if (storeId) { whereClause += " AND ds.store_id = ?"; params.push(Number(storeId)); }

  if (hasPostgres()) {
    let pgWhere = "WHERE 1=1";
    const pgParams: (string | number)[] = [];
    if (startDate) { pgParams.push(startDate); pgWhere += ` AND ds.date >= $${pgParams.length}`; }
    if (endDate) { pgParams.push(endDate); pgWhere += ` AND ds.date <= $${pgParams.length}`; }
    if (storeId) { pgParams.push(Number(storeId)); pgWhere += ` AND ds.store_id = $${pgParams.length}`; }

    const currentStats = await pgOne<{ total: string; active_days: string }>(`
      SELECT
        COALESCE(SUM(ds.quantity), 0) as total,
        COUNT(DISTINCT CASE WHEN ds.quantity > 0 THEN ds.date END) as active_days
      FROM hn_daily_shipments ds
      ${pgWhere}
    `, pgParams);

    const total = Number(currentStats?.total || 0);
    const activeDays = Number(currentStats?.active_days || 0);
    const avgPerDay = activeDays > 0 ? Math.round(total / activeDays) : 0;

    const highestDay = await pgOne<{ date: string; total: string }>(`
      SELECT ds.date, SUM(ds.quantity) as total
      FROM hn_daily_shipments ds
      ${pgWhere}
      GROUP BY ds.date
      HAVING SUM(ds.quantity) > 0
      ORDER BY total DESC
      LIMIT 1
    `, pgParams);

    const lowestDay = await pgOne<{ date: string; total: string }>(`
      SELECT ds.date, SUM(ds.quantity) as total
      FROM hn_daily_shipments ds
      ${pgWhere}
      GROUP BY ds.date
      HAVING SUM(ds.quantity) > 0
      ORDER BY total ASC
      LIMIT 1
    `, pgParams);

    let prevTotal = 0;
    if (prevStart && prevEnd) {
      const prevParams: (string | number)[] = [prevStart, prevEnd];
      let prevWhere = "WHERE ds.date >= $1 AND ds.date <= $2";
      if (storeId) { prevParams.push(Number(storeId)); prevWhere += ` AND ds.store_id = $${prevParams.length}`; }
      const prev = await pgOne<{ total: string }>(`
        SELECT COALESCE(SUM(ds.quantity), 0) as total FROM hn_daily_shipments ds ${prevWhere}
      `, prevParams);
      prevTotal = Number(prev?.total || 0);
    }

    return NextResponse.json({
      total,
      avgPerDay,
      highestDay: highestDay ? { date: highestDay.date, total: Number(highestDay.total) } : null,
      lowestDay: lowestDay ? { date: lowestDay.date, total: Number(lowestDay.total) } : null,
      prevTotal,
      changePercent: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
    });
  }

  const db = getDb();
  seedHistoricalData();

  const currentStats = db.prepare(`
    SELECT
      COALESCE(SUM(ds.quantity), 0) as total,
      COUNT(DISTINCT CASE WHEN ds.quantity > 0 THEN ds.date END) as active_days
    FROM daily_shipments ds
    ${whereClause}
  `).get(...params) as { total: number; active_days: number };

  const avgPerDay = currentStats.active_days > 0
    ? Math.round(currentStats.total / currentStats.active_days)
    : 0;

  const highestDay = db.prepare(`
    SELECT ds.date, SUM(ds.quantity) as total
    FROM daily_shipments ds
    ${whereClause}
    GROUP BY ds.date
    HAVING SUM(ds.quantity) > 0
    ORDER BY total DESC
    LIMIT 1
  `).get(...params) as { date: string; total: number } | undefined;

  const lowestDay = db.prepare(`
    SELECT ds.date, SUM(ds.quantity) as total
    FROM daily_shipments ds
    ${whereClause}
    GROUP BY ds.date
    HAVING SUM(ds.quantity) > 0
    ORDER BY total ASC
    LIMIT 1
  `).get(...params) as { date: string; total: number } | undefined;

  let prevTotal = 0;
  if (prevStart && prevEnd) {
    let prevWhere = "WHERE ds.date >= ? AND ds.date <= ?";
    const prevParams: (string | number)[] = [prevStart, prevEnd];
    if (storeId) { prevWhere += " AND ds.store_id = ?"; prevParams.push(Number(storeId)); }
    const prev = db.prepare(`
      SELECT COALESCE(SUM(ds.quantity), 0) as total FROM daily_shipments ds ${prevWhere}
    `).get(...prevParams) as { total: number };
    prevTotal = prev.total;
  }

  const changePercent = prevTotal > 0
    ? Math.round(((currentStats.total - prevTotal) / prevTotal) * 100)
    : null;

  return NextResponse.json({
    total: currentStats.total,
    avgPerDay,
    highestDay: highestDay || null,
    lowestDay: lowestDay || null,
    prevTotal,
    changePercent,
  });
}
