import { NextResponse } from "next/server";
import { canAccessFeature, getSession } from "@/lib/auth";
import { hasPostgres, pgQuery } from "@/lib/pg";
import { getDb } from "@/lib/db";

interface MonthRow {
  month_key: string;
  total: number;
  total_actions: number;
  completed_actions: number;
  total_highlights: number;
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
  if (!canAccessFeature(session, "rapat")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (hasPostgres()) {
    const ownerClause = session.role === "owner" ? "" : "AND m.created_by = $1";
    const params = session.role === "owner" ? [] : [session.id];

    const months = await pgQuery<MonthRow>(`
      SELECT
        substring(m.meeting_date from 1 for 7) as month_key,
        COUNT(DISTINCT m.id)::int as total,
        COUNT(a.id)::int as total_actions,
        SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END)::int as completed_actions,
        SUM(CASE WHEN m.notes LIKE '%<mark%' OR m.notes LIKE '%==%' THEN 1 ELSE 0 END)::int as total_highlights
      FROM hn_meetings m
      LEFT JOIN hn_meeting_action_items a ON a.meeting_id = m.id
      WHERE 1=1 ${ownerClause}
      GROUP BY month_key
      ORDER BY month_key DESC
      LIMIT 18
    `, params);

    const storeRows = await pgQuery<BreakdownRow>(`
      SELECT
        substring(m.meeting_date from 1 for 7) as month_key,
        COALESCE(s.short_name, 'Umum') as name,
        COUNT(DISTINCT m.id)::int as total
      FROM hn_meetings m
      LEFT JOIN hn_stores s ON m.store_id = s.id
      WHERE 1=1 ${ownerClause}
      GROUP BY month_key, s.short_name
      ORDER BY total DESC
    `, params);

    const userRows = await pgQuery<BreakdownRow>(`
      SELECT
        substring(m.meeting_date from 1 for 7) as month_key,
        COALESCE(u.name, u.username, 'User') as name,
        COUNT(DISTINCT m.id)::int as total
      FROM hn_meetings m
      LEFT JOIN hn_users u ON m.created_by = u.id
      WHERE 1=1 ${ownerClause}
      GROUP BY month_key, u.name, u.username
      ORDER BY total DESC
    `, params);

    return NextResponse.json(months.rows.map((month) => ({
      ...month,
      label: monthLabel(month.month_key),
      stores: storeRows.rows.filter((r) => r.month_key === month.month_key),
      users: userRows.rows.filter((r) => r.month_key === month.month_key),
    })));
  }

  const db = getDb();
  const ownerClause = session.role === "owner" ? "" : "AND m.created_by = ?";
  const params = session.role === "owner" ? [] : [session.id];

  const months = db.prepare(`
    SELECT
      substr(m.meeting_date, 1, 7) as month_key,
      COUNT(DISTINCT m.id) as total,
      COUNT(a.id) as total_actions,
      SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed_actions,
      SUM(CASE WHEN m.notes LIKE '%<mark%' OR m.notes LIKE '%==%' THEN 1 ELSE 0 END) as total_highlights
    FROM meetings m
    LEFT JOIN meeting_action_items a ON a.meeting_id = m.id
    WHERE 1=1 ${ownerClause}
    GROUP BY month_key
    ORDER BY month_key DESC
    LIMIT 18
  `).all(...params) as MonthRow[];

  const storeRows = db.prepare(`
    SELECT
      substr(m.meeting_date, 1, 7) as month_key,
      COALESCE(s.short_name, 'Umum') as name,
      COUNT(DISTINCT m.id) as total
    FROM meetings m
    LEFT JOIN stores s ON m.store_id = s.id
    WHERE 1=1 ${ownerClause}
    GROUP BY month_key, name
    ORDER BY total DESC
  `).all(...params) as BreakdownRow[];

  const userRows = db.prepare(`
    SELECT
      substr(m.meeting_date, 1, 7) as month_key,
      COALESCE(u.name, u.username, 'User') as name,
      COUNT(DISTINCT m.id) as total
    FROM meetings m
    LEFT JOIN users u ON m.created_by = u.id
    WHERE 1=1 ${ownerClause}
    GROUP BY month_key, name
    ORDER BY total DESC
  `).all(...params) as BreakdownRow[];

  return NextResponse.json(months.map((month) => ({
    ...month,
    label: monthLabel(month.month_key),
    stores: storeRows.filter((r) => r.month_key === month.month_key),
    users: userRows.filter((r) => r.month_key === month.month_key),
  })));
}
