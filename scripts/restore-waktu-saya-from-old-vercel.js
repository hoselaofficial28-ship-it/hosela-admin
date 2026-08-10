const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const ROOT = path.resolve(__dirname, "..");
const BACKUP_DIR = path.join(ROOT, "backups");

const OLD_TIME_AUDITS = [
  {
    username: "sanjaya",
    date: "2026-08-10",
    task_name: "Buat 3 Konten",
    energy: "took",
    value: "$",
    notes: "Dipulihkan dari DRIP Matrix lama: Delegasikan / menyedot energi + nilai rendah",
    sort_order: 0,
  },
];

const OLD_WEEK_BLOCKS = [
  {
    username: "sanjaya",
    week_start: "2026-08-09",
    day_of_week: 1,
    start_time: "16:00",
    end_time: "16:30",
    label: "Meeting with agus",
    block_type: "meeting",
  },
];

function loadEnv() {
  const envPath = path.join(ROOT, ".env.prod");
  const parsed = {};
  if (!fs.existsSync(envPath)) return parsed;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index);
    let value = trimmed.slice(index + 1);
    value = value.replace(/^['"]|['"]$/g, "");
    parsed[key] = value;
  }
  return parsed;
}

async function tableRows(client, table) {
  const result = await client.query(`SELECT * FROM ${table} ORDER BY id`);
  return result.rows;
}

async function getUserId(client, username) {
  const result = await client.query("SELECT id FROM hn_users WHERE username = $1 LIMIT 1", [username]);
  if (result.rows.length === 0) throw new Error(`User tidak ditemukan: ${username}`);
  return result.rows[0].id;
}

async function main() {
  const env = { ...loadEnv(), ...process.env };
  if (!env.DATABASE_URL || env.DATABASE_URL === "[SENSITIVE]") {
    throw new Error("DATABASE_URL tidak ditemukan. Jalankan dengan env DATABASE_URL.");
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const backup = {
      created_at: new Date().toISOString(),
      hn_time_audit: await tableRows(client, "hn_time_audit"),
      hn_perfect_week: await tableRows(client, "hn_perfect_week"),
      hn_weekly_review: await tableRows(client, "hn_weekly_review"),
    };
    const backupPath = path.join(BACKUP_DIR, `waktu-saya-before-restore-${backup.created_at.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

    for (const audit of OLD_TIME_AUDITS) {
      const userId = await getUserId(client, audit.username);
      const existing = await client.query(
        "SELECT id FROM hn_time_audit WHERE user_id = $1 AND date = $2 AND task_name = $3 LIMIT 1",
        [userId, audit.date, audit.task_name]
      );

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE hn_time_audit
           SET energy = $1, value = $2, notes = $3, sort_order = $4
           WHERE id = $5`,
          [audit.energy, audit.value, audit.notes, audit.sort_order, existing.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO hn_time_audit (user_id, date, task_name, energy, value, notes, sort_order, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
          [userId, audit.date, audit.task_name, audit.energy, audit.value, audit.notes, audit.sort_order]
        );
      }
    }

    for (const block of OLD_WEEK_BLOCKS) {
      const userId = await getUserId(client, block.username);
      const existing = await client.query(
        `SELECT id FROM hn_perfect_week
         WHERE user_id = $1 AND week_start = $2 AND day_of_week = $3
           AND start_time = $4 AND end_time = $5 AND label = $6
         LIMIT 1`,
        [userId, block.week_start, block.day_of_week, block.start_time, block.end_time, block.label]
      );

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE hn_perfect_week
           SET block_type = $1, updated_at = now()
           WHERE id = $2`,
          [block.block_type, existing.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO hn_perfect_week (
             user_id, day_of_week, start_time, end_time, label, block_type, week_start, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
          [userId, block.day_of_week, block.start_time, block.end_time, block.label, block.block_type, block.week_start]
        );
      }
    }

    await client.query("SELECT setval(pg_get_serial_sequence('hn_time_audit','id'), COALESCE((SELECT MAX(id) FROM hn_time_audit), 1), true)");
    await client.query("SELECT setval(pg_get_serial_sequence('hn_perfect_week','id'), COALESCE((SELECT MAX(id) FROM hn_perfect_week), 1), true)");
    await client.query("SELECT setval(pg_get_serial_sequence('hn_weekly_review','id'), COALESCE((SELECT MAX(id) FROM hn_weekly_review), 1), true)");

    await client.query("COMMIT");

    const verification = {
      backupPath,
      time_audit: (await pool.query(`
        SELECT a.*, u.name AS user_name
        FROM hn_time_audit a
        LEFT JOIN hn_users u ON u.id = a.user_id
        ORDER BY a.date DESC, a.sort_order, a.id
      `)).rows,
      perfect_week: (await pool.query(`
        SELECT w.*, u.name AS user_name
        FROM hn_perfect_week w
        LEFT JOIN hn_users u ON u.id = w.user_id
        ORDER BY w.week_start DESC, w.day_of_week, w.start_time
      `)).rows,
      weekly_review: (await pool.query(`
        SELECT r.*, u.name AS user_name
        FROM hn_weekly_review r
        LEFT JOIN hn_users u ON u.id = r.user_id
        ORDER BY r.week_start DESC
      `)).rows,
    };
    console.log(JSON.stringify(verification, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
