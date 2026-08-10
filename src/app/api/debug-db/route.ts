import { NextResponse } from "next/server";
import { hasPostgres, pgQuery } from "@/lib/pg";

export async function GET() {
  if (!hasPostgres()) return NextResponse.json({ error: "No postgres" });

  try {
    const sizeResult = await pgQuery("SELECT pg_size_pretty(pg_database_size(current_database())) as db_size");
    const tables = await pgQuery(`
      SELECT tablename,
             pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size
      FROM pg_tables t
      WHERE schemaname = 'public' AND tablename LIKE 'hn_%'
      ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
    `);
    const counts = await pgQuery(`
      SELECT 'hn_daily_shipments' as tbl, count(*) as cnt FROM hn_daily_shipments
      UNION ALL SELECT 'hn_users', count(*) FROM hn_users
      UNION ALL SELECT 'hn_perfect_week', count(*) FROM hn_perfect_week
      UNION ALL SELECT 'hn_time_audit', count(*) FROM hn_time_audit
      UNION ALL SELECT 'hn_admin_notes', count(*) FROM hn_admin_notes
      UNION ALL SELECT 'hn_tasks', count(*) FROM hn_tasks
      UNION ALL SELECT 'hn_meetings', count(*) FROM hn_meetings
      UNION ALL SELECT 'hn_lab_riset', count(*) FROM hn_lab_riset
      UNION ALL SELECT 'hn_notifications', count(*) FROM hn_notifications
      UNION ALL SELECT 'hn_stores', count(*) FROM hn_stores
      UNION ALL SELECT 'hn_user_permissions', count(*) FROM hn_user_permissions
    `);
    const readOnly = await pgQuery("SHOW default_transaction_read_only");

    return NextResponse.json({
      db_size: sizeResult.rows[0]?.db_size,
      read_only: readOnly.rows[0],
      tables: tables.rows,
      row_counts: counts.rows,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
