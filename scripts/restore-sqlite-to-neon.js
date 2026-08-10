const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const sqlitePath = process.env.SQLITE_PATH || path.join(process.cwd(), "hosela.db");

if (!connectionString) {
  console.error("Missing DATABASE_URL or POSTGRES_URL.");
  process.exit(1);
}

if (process.env.CONFIRM_RESTORE !== "YES") {
  console.error("Refusing to write. Set CONFIRM_RESTORE=YES to restore SQLite data into Neon.");
  process.exit(1);
}

const tables = [
  {
    sqlite: "stores",
    pg: "hn_stores",
    columns: ["id", "name", "short_name", "color", "sort_order"],
    serial: true,
  },
  {
    sqlite: "users",
    pg: "hn_users",
    columns: ["id", "username", "password_hash", "role", "department", "status", "name", "email", "created_at"],
    serial: true,
  },
  {
    sqlite: "user_permissions",
    pg: "hn_user_permissions",
    columns: ["user_id", "feature", "allowed", "updated_at"],
    serial: false,
  },
  {
    sqlite: "daily_shipments",
    pg: "hn_daily_shipments",
    columns: [
      "id",
      "date",
      "store_id",
      "morning_quantity",
      "afternoon_quantity",
      "quantity",
      "created_by",
      "created_at",
      "updated_at",
    ],
    serial: true,
  },
  {
    sqlite: "tasks",
    pg: "hn_tasks",
    columns: [
      "id",
      "title",
      "description",
      "assigned_to",
      "status",
      "priority",
      "deadline",
      "reminder_at",
      "reminder_sent",
      "store_id",
      "created_by",
      "created_at",
      "updated_at",
      "completed_at",
    ],
    serial: true,
  },
  {
    sqlite: "express_shipments",
    pg: "hn_express_shipments",
    columns: ["id", "store_id", "start_date", "end_date", "quantity", "notes", "created_at"],
    serial: true,
  },
  {
    sqlite: "order_peak_times",
    pg: "hn_order_peak_times",
    columns: ["id", "date", "store_id", "start_time", "end_time", "order_count", "notes", "created_by", "created_at", "updated_at"],
    serial: true,
  },
  {
    sqlite: "price_changes",
    pg: "hn_price_changes",
    columns: ["id", "date", "store_id", "change_type", "percentage", "notes", "created_at"],
    serial: true,
  },
  {
    sqlite: "live_schedules",
    pg: "hn_live_schedules",
    columns: ["id", "date", "store_id", "product_name", "platform", "start_time", "end_time", "notes", "created_at"],
    serial: true,
  },
  {
    sqlite: "work_logs",
    pg: "hn_work_logs",
    columns: ["id", "date", "store_id", "category", "description", "created_by", "created_at"],
    serial: true,
  },
  {
    sqlite: "admin_notes",
    pg: "hn_admin_notes",
    columns: [
      "id",
      "user_id",
      "title",
      "description",
      "status",
      "priority",
      "due_date",
      "store_id",
      "created_at",
      "updated_at",
      "completed_at",
      "task_id",
    ],
    serial: true,
  },
  {
    sqlite: "meetings",
    pg: "hn_meetings",
    columns: [
      "id",
      "title",
      "meeting_date",
      "participants",
      "agenda",
      "notes",
      "decisions",
      "important_points",
      "store_id",
      "created_by",
      "created_at",
      "updated_at",
    ],
    serial: true,
  },
  {
    sqlite: "meeting_action_items",
    pg: "hn_meeting_action_items",
    columns: ["id", "meeting_id", "title", "assigned_to", "due_date", "status", "task_id", "note_id", "created_at", "completed_at"],
    serial: true,
  },
  {
    sqlite: "notifications",
    pg: "hn_notifications",
    columns: ["id", "user_id", "task_id", "title", "message", "read", "created_at"],
    serial: true,
  },
  {
    sqlite: "lab_riset",
    pg: "hn_lab_riset",
    columns: [
      "id",
      "user_id",
      "title",
      "hypothesis",
      "method",
      "result",
      "conclusion",
      "status",
      "category",
      "store_id",
      "cost",
      "start_date",
      "end_date",
      "tags",
      "created_at",
      "updated_at",
    ],
    serial: true,
  },
  {
    sqlite: "time_audit",
    pg: "hn_time_audit",
    columns: ["id", "user_id", "date", "task_name", "energy", "value", "notes", "sort_order", "created_at"],
    serial: true,
  },
  {
    sqlite: "perfect_week",
    pg: "hn_perfect_week",
    columns: ["id", "user_id", "day_of_week", "start_time", "end_time", "label", "block_type", "created_at", "updated_at"],
    serial: true,
  },
  {
    sqlite: "weekly_review",
    pg: "hn_weekly_review",
    columns: [
      "id",
      "user_id",
      "week_start",
      "went_well",
      "energy_drain",
      "to_delegate",
      "wins",
      "energy_score",
      "focus_score",
      "notes",
      "created_at",
      "updated_at",
    ],
    serial: true,
  },
];

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function insertSql(table) {
  const columns = table.columns.map(quoteIdent).join(", ");
  const params = table.columns.map((_, index) => `$${index + 1}`).join(", ");
  return `INSERT INTO ${quoteIdent(table.pg)} (${columns}) VALUES (${params})`;
}

async function main() {
  const sqlite = new Database(sqlitePath, { readonly: true });
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  const client = await pool.connect();
  try {
    const readOnly = await client.query("SHOW default_transaction_read_only");
    if (readOnly.rows[0].default_transaction_read_only !== "off") {
      throw new Error("Target PostgreSQL database is read-only.");
    }

    const backup = {};
    for (const table of tables) {
      const result = await client.query(`SELECT * FROM ${quoteIdent(table.pg)} ORDER BY 1`);
      backup[table.pg] = result.rows;
    }

    const backupDir = path.join(process.cwd(), "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `neon-before-sqlite-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(`Backup written: ${backupPath}`);

    await client.query("BEGIN");
    await client.query(`TRUNCATE TABLE ${tables.map((table) => quoteIdent(table.pg)).join(", ")} RESTART IDENTITY CASCADE`);

    for (const table of tables) {
      const rows = sqlite.prepare(`SELECT ${table.columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(table.sqlite)} ORDER BY rowid`).all();
      const sql = insertSql(table);
      for (const row of rows) {
        await client.query(sql, table.columns.map((column) => row[column]));
      }
      console.log(`Imported ${rows.length} rows into ${table.pg}`);
    }

    for (const table of tables.filter((item) => item.serial)) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${table.pg}', 'id'), COALESCE((SELECT MAX(id) + 1 FROM ${quoteIdent(table.pg)}), 1), false)`
      );
    }

    await client.query("COMMIT");

    console.log("\nVerification:");
    for (const table of tables) {
      const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdent(table.pg)}`);
      console.log(`${table.pg}\t${result.rows[0].count}`);
    }
    const shipmentSummary = await client.query(
      "SELECT MIN(date) AS min_date, MAX(date) AS max_date, COUNT(*)::int AS rows, COALESCE(SUM(quantity), 0)::int AS total_qty FROM hn_daily_shipments"
    );
    console.log("hn_daily_shipments_summary", JSON.stringify(shipmentSummary.rows[0]));
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
