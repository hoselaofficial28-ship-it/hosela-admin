const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const sourceUrl = process.env.OLD_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!sourceUrl) {
  console.error("Missing OLD_DATABASE_URL for the old read-only Neon database.");
  process.exit(1);
}

if (!targetUrl) {
  console.error("Missing DATABASE_URL or POSTGRES_URL for the new Neon database.");
  process.exit(1);
}

if (process.env.CONFIRM_RESTORE !== "YES") {
  console.error("Refusing to write. Set CONFIRM_RESTORE=YES to migrate old Neon data into the new Neon database.");
  process.exit(1);
}

const tables = [
  { pg: "hn_stores", serial: true },
  { pg: "hn_users", serial: true },
  { pg: "hn_user_permissions", serial: false },
  { pg: "hn_daily_shipments", serial: true },
  { pg: "hn_tasks", serial: true },
  { pg: "hn_express_shipments", serial: true },
  { pg: "hn_order_peak_times", serial: true },
  { pg: "hn_price_changes", serial: true },
  { pg: "hn_live_schedules", serial: true },
  { pg: "hn_work_logs", serial: true },
  { pg: "hn_admin_notes", serial: true },
  { pg: "hn_meetings", serial: true },
  { pg: "hn_meeting_action_items", serial: true },
  { pg: "hn_notifications", serial: true },
  { pg: "hn_lab_riset", serial: true },
  { pg: "hn_time_audit", serial: true },
  { pg: "hn_perfect_week", serial: true },
  { pg: "hn_weekly_review", serial: true },
];

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function getColumns(client, tableName) {
  const result = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName]
  );
  return result.rows.map((row) => row.column_name);
}

async function assertCompatibleColumns(sourceClient, targetClient, tableName) {
  const sourceColumns = await getColumns(sourceClient, tableName);
  const targetColumns = await getColumns(targetClient, tableName);
  const sourceSet = new Set(sourceColumns);
  const commonColumns = targetColumns.filter((column) => sourceSet.has(column));
  const missingRequired = ["id"].filter((column) => targetColumns.includes(column) && !commonColumns.includes(column));

  if (missingRequired.length > 0) {
    throw new Error(`${tableName} is missing required source columns: ${missingRequired.join(", ")}`);
  }

  if (commonColumns.length === 0) {
    throw new Error(`${tableName} has no compatible columns between source and target.`);
  }

  return commonColumns;
}

async function main() {
  const sourcePool = new Pool({
    connectionString: sourceUrl,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
  const targetPool = new Pool({
    connectionString: targetUrl,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  const source = await sourcePool.connect();
  const target = await targetPool.connect();

  try {
    const targetReadOnly = await target.query("SHOW default_transaction_read_only");
    if (targetReadOnly.rows[0].default_transaction_read_only !== "off") {
      throw new Error("Target PostgreSQL database is read-only.");
    }

    const sourceReadOnly = await source.query("SHOW default_transaction_read_only");
    console.log(`Source default_transaction_read_only=${sourceReadOnly.rows[0].default_transaction_read_only}`);

    const backup = {};
    for (const table of tables) {
      const result = await target.query(`SELECT * FROM ${quoteIdent(table.pg)} ORDER BY 1`);
      backup[table.pg] = result.rows;
    }

    const backupDir = path.join(process.cwd(), "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `neon-before-old-neon-migration-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(`Target backup written: ${backupPath}`);

    const tableColumns = new Map();
    for (const table of tables) {
      tableColumns.set(table.pg, await assertCompatibleColumns(source, target, table.pg));
    }

    await target.query("BEGIN");
    await target.query(`TRUNCATE TABLE ${tables.map((table) => quoteIdent(table.pg)).join(", ")} RESTART IDENTITY CASCADE`);

    for (const table of tables) {
      const columns = tableColumns.get(table.pg);
      const columnList = columns.map(quoteIdent).join(", ");
      const rows = await source.query(`SELECT ${columnList} FROM ${quoteIdent(table.pg)} ORDER BY 1`);
      const params = columns.map((_, index) => `$${index + 1}`).join(", ");
      const insert = `INSERT INTO ${quoteIdent(table.pg)} (${columnList}) VALUES (${params})`;

      for (const row of rows.rows) {
        await target.query(insert, columns.map((column) => row[column]));
      }

      console.log(`Migrated ${rows.rowCount} rows into ${table.pg}`);
    }

    for (const table of tables.filter((item) => item.serial)) {
      await target.query(
        `SELECT setval(pg_get_serial_sequence('${table.pg}', 'id'), COALESCE((SELECT MAX(id) + 1 FROM ${quoteIdent(table.pg)}), 1), false)`
      );
    }

    await target.query("COMMIT");

    console.log("\nVerification:");
    for (const table of tables) {
      const result = await target.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdent(table.pg)}`);
      console.log(`${table.pg}\t${result.rows[0].count}`);
    }
  } catch (error) {
    try {
      await target.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    source.release();
    target.release();
    await sourcePool.end();
    await targetPool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
