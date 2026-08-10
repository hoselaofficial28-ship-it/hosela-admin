const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const ROOT = path.resolve(__dirname, "..");
const BACKUP_DIR = path.join(ROOT, "backups");

const OLD_MEETINGS = [
  {
    title: "rapat mingguan",
    meeting_date: "2026-08-04",
    participants: "desi",
    store_name: "GO AUTO OFFICIAL",
    created_by_username: "sanjaya",
    notes: [
      "Followers target naikin ke 21900",
      "Lighting sudah membaik , pastikan warna tetap dalam keadaan putih ,",
      "Penjualan minggu ini 74.400.000",
      "Target minggu depan = cek barang yang sudah mulai habis , dan kedepannya pembelian barang harus dihitung per setengah bulan dan tidak langsung massal dalam pembelian",
    ].join("\n"),
    action_items: [
      {
        title: "Followers target naikin ke 21900",
        assigned_to: "live",
        due_date: "2026-08-11",
        status: "pending",
      },
      {
        title: "Target minggu depan = cek barang yang sudah mulai habis",
        assigned_to: "pembelian",
        due_date: "2026-08-13",
        status: "pending",
      },
    ],
  },
];

function loadEnv() {
  const envPath = path.join(ROOT, ".env.prod");
  const parsed = {};
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

async function main() {
  const env = { ...loadEnv(), ...process.env };
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL tidak ditemukan di .env.prod");

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const backup = {
      created_at: new Date().toISOString(),
      hn_meetings: await tableRows(client, "hn_meetings"),
      hn_meeting_action_items: await tableRows(client, "hn_meeting_action_items"),
      hn_tasks: await tableRows(client, "hn_tasks"),
      hn_admin_notes: await tableRows(client, "hn_admin_notes"),
    };
    const backupPath = path.join(BACKUP_DIR, `meetings-before-restore-${backup.created_at.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

    for (const meeting of OLD_MEETINGS) {
      const store = await client.query("SELECT id FROM hn_stores WHERE name = $1 LIMIT 1", [meeting.store_name]);
      if (store.rows.length === 0) throw new Error(`Store tidak ditemukan: ${meeting.store_name}`);

      const user = await client.query("SELECT id FROM hn_users WHERE username = $1 LIMIT 1", [meeting.created_by_username]);
      if (user.rows.length === 0) throw new Error(`User tidak ditemukan: ${meeting.created_by_username}`);

      const existing = await client.query(
        "SELECT id FROM hn_meetings WHERE title = $1 AND meeting_date = $2 LIMIT 1",
        [meeting.title, meeting.meeting_date]
      );

      let meetingId;
      if (existing.rows.length > 0) {
        meetingId = existing.rows[0].id;
        await client.query(
          `UPDATE hn_meetings
           SET participants = $1, agenda = $2, notes = $3, decisions = $4,
               important_points = $5, store_id = $6, created_by = $7, updated_at = now()
           WHERE id = $8`,
          [
            meeting.participants,
            null,
            meeting.notes,
            null,
            null,
            store.rows[0].id,
            user.rows[0].id,
            meetingId,
          ]
        );
      } else {
        const inserted = await client.query(
          `INSERT INTO hn_meetings (
             title, meeting_date, participants, agenda, notes, decisions,
             important_points, store_id, created_by, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
           RETURNING id`,
          [
            meeting.title,
            meeting.meeting_date,
            meeting.participants,
            null,
            meeting.notes,
            null,
            null,
            store.rows[0].id,
            user.rows[0].id,
          ]
        );
        meetingId = inserted.rows[0].id;
      }

      const keepIds = [];
      for (const action of meeting.action_items) {
        const found = await client.query(
          "SELECT id FROM hn_meeting_action_items WHERE meeting_id = $1 AND title = $2 LIMIT 1",
          [meetingId, action.title]
        );

        let actionId;
        if (found.rows.length > 0) {
          actionId = found.rows[0].id;
          await client.query(
            `UPDATE hn_meeting_action_items
             SET assigned_to = $1, due_date = $2, status = $3,
                 completed_at = CASE WHEN $3 = 'completed' THEN COALESCE(completed_at, $4) ELSE NULL END
             WHERE id = $5`,
            [action.assigned_to, action.due_date, action.status, action.due_date, actionId]
          );
        } else {
          const inserted = await client.query(
            `INSERT INTO hn_meeting_action_items (meeting_id, title, assigned_to, due_date, status, created_at)
             VALUES ($1, $2, $3, $4, $5, now())
             RETURNING id`,
            [meetingId, action.title, action.assigned_to, action.due_date, action.status]
          );
          actionId = inserted.rows[0].id;
        }
        keepIds.push(actionId);
      }

      if (keepIds.length > 0) {
        await client.query(
          `DELETE FROM hn_meeting_action_items
           WHERE meeting_id = $1 AND id <> ALL($2::int[])`,
          [meetingId, keepIds]
        );
      }
    }

    await client.query("SELECT setval(pg_get_serial_sequence('hn_meetings','id'), COALESCE((SELECT MAX(id) FROM hn_meetings), 1), true)");
    await client.query("SELECT setval(pg_get_serial_sequence('hn_meeting_action_items','id'), COALESCE((SELECT MAX(id) FROM hn_meeting_action_items), 1), true)");

    await client.query("COMMIT");

    const verification = await pool.query(`
      SELECT
        m.id,
        m.title,
        m.meeting_date,
        m.participants,
        s.name AS store_name,
        u.name AS created_by_name,
        m.notes,
        COALESCE(
          json_agg(
            json_build_object(
              'id', a.id,
              'title', a.title,
              'assigned_to', a.assigned_to,
              'due_date', a.due_date,
              'status', a.status
            )
            ORDER BY a.id
          ) FILTER (WHERE a.id IS NOT NULL),
          '[]'
        ) AS action_items
      FROM hn_meetings m
      LEFT JOIN hn_stores s ON s.id = m.store_id
      LEFT JOIN hn_users u ON u.id = m.created_by
      LEFT JOIN hn_meeting_action_items a ON a.meeting_id = m.id
      GROUP BY m.id, s.name, u.name
      ORDER BY m.meeting_date DESC, m.id DESC
    `);

    console.log(JSON.stringify({ backupPath, meetings: verification.rows }, null, 2));
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
