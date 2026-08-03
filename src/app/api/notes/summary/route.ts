import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery } from "@/lib/pg";

interface MonthRow {
  month_key: string;
  total: number;
  completed: number;
  in_progress: number;
  pending: number;
  high_priority: number;
}

interface BreakdownRow {
  month_key: string;
  name: string | null;
  total: number;
}

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessFeature(session, "catatan")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ownerClause = session.role === "owner" ? "" : "WHERE n.user_id = ?";
  const params = session.role === "owner" ? [] : [session.id];

  if (hasPostgres()) {
    const pgOwnerClause = session.role === "owner" ? "" : "WHERE n.user_id = $1";
    const pgParams = session.role === "owner" ? [] : [session.id];

    const months = await pgQuery<MonthRow>(`
      SELECT
        to_char(COALESCE(n.completed_at::timestamptz, n.updated_at, n.created_at), 'YYYY-MM') as month_key,
        COUNT(*)::int as total,
        SUM(CASE WHEN n.status = 'completed' THEN 1 ELSE 0 END)::int as completed,
        SUM(CASE WHEN n.status = 'in_progress' THEN 1 ELSE 0 END)::int as in_progress,
        SUM(CASE WHEN n.status = 'pending' THEN 1 ELSE 0 END)::int as pending,
        SUM(CASE WHEN n.priority = 'high' THEN 1 ELSE 0 END)::int as high_priority
      FROM hn_admin_notes n
      ${pgOwnerClause}
      GROUP BY month_key
      ORDER BY month_key DESC
      LIMIT 18
    `, pgParams);

    const storeRows = await pgQuery<BreakdownRow>(`
      SELECT
        to_char(COALESCE(n.completed_at::timestamptz, n.updated_at, n.created_at), 'YYYY-MM') as month_key,
        COALESCE(s.short_name, 'Umum') as name,
        COUNT(*)::int as total
      FROM hn_admin_notes n
      LEFT JOIN hn_stores s ON n.store_id = s.id
      ${pgOwnerClause}
      GROUP BY month_key, s.short_name
      ORDER BY total DESC
    `, pgParams);

    const userRows = await pgQuery<BreakdownRow>(`
      SELECT
        to_char(COALESCE(n.completed_at::timestamptz, n.updated_at, n.created_at), 'YYYY-MM') as month_key,
        COALESCE(u.name, u.username, 'User') as name,
        COUNT(*)::int as total
      FROM hn_admin_notes n
      LEFT JOIN hn_users u ON n.user_id = u.id
      ${pgOwnerClause}
      GROUP BY month_key, u.name, u.username
      ORDER BY total DESC
    `, pgParams);

    return NextResponse.json(months.rows.map((month) => ({
      ...month,
      label: monthLabel(month.month_key),
      stores: storeRows.rows.filter((row) => row.month_key === month.month_key),
      users: userRows.rows.filter((row) => row.month_key === month.month_key),
    })));
  }

  const db = getDb();

  const months = db.prepare(`
    SELECT
      substr(COALESCE(n.completed_at, n.updated_at, n.created_at), 1, 7) as month_key,
      COUNT(*) as total,
      SUM(CASE WHEN n.status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN n.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN n.status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN n.priority = 'high' THEN 1 ELSE 0 END) as high_priority
    FROM admin_notes n
    ${ownerClause}
    GROUP BY month_key
    ORDER BY month_key DESC
    LIMIT 18
  `).all(...params) as MonthRow[];

  const storeRows = db.prepare(`
    SELECT
      substr(COALESCE(n.completed_at, n.updated_at, n.created_at), 1, 7) as month_key,
      COALESCE(s.short_name, 'Umum') as name,
      COUNT(*) as total
    FROM admin_notes n
    LEFT JOIN stores s ON n.store_id = s.id
    ${ownerClause}
    GROUP BY month_key, name
    ORDER BY total DESC
  `).all(...params) as BreakdownRow[];

  const userRows = db.prepare(`
    SELECT
      substr(COALESCE(n.completed_at, n.updated_at, n.created_at), 1, 7) as month_key,
      COALESCE(u.name, u.username, 'User') as name,
      COUNT(*) as total
    FROM admin_notes n
    LEFT JOIN users u ON n.user_id = u.id
    ${ownerClause}
    GROUP BY month_key, name
    ORDER BY total DESC
  `).all(...params) as BreakdownRow[];

  return NextResponse.json(months.map((month) => ({
    ...month,
    label: monthLabel(month.month_key),
    stores: storeRows.filter((row) => row.month_key === month.month_key),
    users: userRows.filter((row) => row.month_key === month.month_key),
  })));
}
