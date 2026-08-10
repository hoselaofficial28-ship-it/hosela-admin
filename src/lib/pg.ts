import { Pool, type PoolClient, type QueryResultRow } from "pg";
import bcrypt from "bcryptjs";
import { FEATURES, getDefaultPermissions } from "./permissions";
import { historicalData } from "./seed-history";

const globalForPg = globalThis as unknown as {
  hoselaPgPool?: Pool;
  hoselaPgInitialized?: Promise<void>;
};

export function hasPostgres() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.STORAGE_URL);
}

function getConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.STORAGE_URL || "";
}

export function getPgPool() {
  if (!globalForPg.hoselaPgPool) {
    globalForPg.hoselaPgPool = new Pool({
      connectionString: getConnectionString(),
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
  }

  return globalForPg.hoselaPgPool;
}

export async function initPg() {
  if (!hasPostgres()) return;
  if (!globalForPg.hoselaPgInitialized) {
    globalForPg.hoselaPgInitialized = initializePostgres().catch((err) => {
      globalForPg.hoselaPgInitialized = undefined;
      throw err;
    });
  }
  await globalForPg.hoselaPgInitialized;
}

export async function pgQuery<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  await initPg();
  return getPgPool().query<T>(text, params);
}

export async function pgOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const result = await pgQuery<T>(text, params);
  return result.rows[0];
}

export async function pgTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  await initPg();
  const client = await getPgPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function initializePostgres() {
  const pool = getPgPool();

  const tableCheck = await pool.query(
    "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hn_users'"
  );
  const tablesExist = Number(tableCheck.rows[0].count) > 0;

  if (tablesExist) {
    try {
      await runMigrations(pool);
    } catch {
      // read-only DB — migrations are idempotent, safe to skip
    }
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hn_stores (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS hn_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin' CHECK(role IN ('owner', 'admin')),
      department TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('pending', 'active', 'inactive')),
      name TEXT,
      email TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS hn_user_permissions (
      user_id INTEGER NOT NULL REFERENCES hn_users(id) ON DELETE CASCADE,
      feature TEXT NOT NULL,
      allowed INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (user_id, feature)
    );

    CREATE TABLE IF NOT EXISTS hn_daily_shipments (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      store_id INTEGER NOT NULL REFERENCES hn_stores(id),
      morning_quantity INTEGER NOT NULL DEFAULT 0,
      afternoon_quantity INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(date, store_id)
    );

    CREATE TABLE IF NOT EXISTS hn_tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      assigned_to TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
      deadline TEXT,
      reminder_at TEXT,
      reminder_sent INTEGER DEFAULT 0,
      store_id INTEGER REFERENCES hn_stores(id),
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hn_express_shipments (
      id SERIAL PRIMARY KEY,
      store_id INTEGER NOT NULL REFERENCES hn_stores(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS hn_order_peak_times (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      store_id INTEGER NOT NULL REFERENCES hn_stores(id),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      order_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS hn_price_changes (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      store_id INTEGER REFERENCES hn_stores(id),
      change_type TEXT NOT NULL CHECK(change_type IN ('increase', 'decrease')),
      percentage REAL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS hn_live_schedules (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      store_id INTEGER NOT NULL REFERENCES hn_stores(id),
      product_name TEXT,
      platform TEXT DEFAULT 'shopee' CHECK(platform IN ('shopee', 'tiktok')),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS hn_work_logs (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      store_id INTEGER REFERENCES hn_stores(id),
      category TEXT NOT NULL CHECK(category IN ('gangguan', 'izin', 'return', 'lainnya')),
      description TEXT NOT NULL,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS hn_notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES hn_users(id) ON DELETE CASCADE,
      task_id INTEGER REFERENCES hn_tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS hn_admin_notes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES hn_users(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high')),
      due_date TEXT,
      store_id INTEGER REFERENCES hn_stores(id),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hn_meetings (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      meeting_date TEXT NOT NULL,
      participants TEXT,
      agenda TEXT,
      notes TEXT,
      decisions TEXT,
      important_points TEXT,
      store_id INTEGER REFERENCES hn_stores(id),
      created_by INTEGER REFERENCES hn_users(id),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS hn_meeting_action_items (
      id SERIAL PRIMARY KEY,
      meeting_id INTEGER NOT NULL REFERENCES hn_meetings(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      assigned_to TEXT,
      due_date TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
      task_id INTEGER REFERENCES hn_tasks(id),
      note_id INTEGER REFERENCES hn_admin_notes(id),
      created_at TIMESTAMPTZ DEFAULT now(),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hn_lab_riset (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES hn_users(id),
      title TEXT NOT NULL,
      hypothesis TEXT,
      method TEXT,
      result TEXT,
      conclusion TEXT,
      status TEXT DEFAULT 'planning' CHECK(status IN ('planning', 'running', 'completed')),
      category TEXT DEFAULT 'other' CHECK(category IN ('ads', 'pricing', 'product', 'marketplace', 'content', 'other')),
      store_id INTEGER REFERENCES hn_stores(id),
      cost TEXT,
      start_date TEXT,
      end_date TEXT,
      tags TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS hn_idx_lab_riset_user ON hn_lab_riset(user_id, status);
    CREATE INDEX IF NOT EXISTS hn_idx_lab_riset_category ON hn_lab_riset(category);

    CREATE TABLE IF NOT EXISTS hn_time_audit (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES hn_users(id),
      date TEXT NOT NULL,
      task_name TEXT NOT NULL,
      energy TEXT NOT NULL CHECK(energy IN ('gave', 'took')),
      value TEXT NOT NULL DEFAULT '$' CHECK(value IN ('$', '$$', '$$$', '$$$$')),
      notes TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS hn_perfect_week (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES hn_users(id),
      day_of_week INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      label TEXT NOT NULL,
      block_type TEXT NOT NULL DEFAULT 'focus' CHECK(block_type IN ('focus', 'meeting', 'personal', 'admin', 'flex', 'routine')),
      week_start TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS hn_weekly_review (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES hn_users(id),
      week_start TEXT NOT NULL,
      went_well TEXT,
      energy_drain TEXT,
      to_delegate TEXT,
      wins TEXT,
      energy_score INTEGER CHECK(energy_score >= 1 AND energy_score <= 10),
      focus_score INTEGER CHECK(focus_score >= 1 AND focus_score <= 10),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(user_id, week_start)
    );

    CREATE INDEX IF NOT EXISTS hn_idx_time_audit_user_date ON hn_time_audit(user_id, date);
    CREATE INDEX IF NOT EXISTS hn_idx_perfect_week_user ON hn_perfect_week(user_id);
    CREATE INDEX IF NOT EXISTS hn_idx_perfect_week_user_week ON hn_perfect_week(user_id, week_start);
    CREATE INDEX IF NOT EXISTS hn_idx_weekly_review_user ON hn_weekly_review(user_id, week_start);

    CREATE INDEX IF NOT EXISTS hn_idx_shipments_date ON hn_daily_shipments(date);
    CREATE INDEX IF NOT EXISTS hn_idx_shipments_store ON hn_daily_shipments(store_id);
    CREATE INDEX IF NOT EXISTS hn_idx_express_shipments_date ON hn_express_shipments(start_date, end_date);
    CREATE INDEX IF NOT EXISTS hn_idx_order_peak_times_date ON hn_order_peak_times(date);
    CREATE INDEX IF NOT EXISTS hn_idx_order_peak_times_store ON hn_order_peak_times(store_id);
    CREATE INDEX IF NOT EXISTS hn_idx_tasks_status ON hn_tasks(status);
    CREATE INDEX IF NOT EXISTS hn_idx_notifications_user ON hn_notifications(user_id, read);
    CREATE INDEX IF NOT EXISTS hn_idx_admin_notes_user ON hn_admin_notes(user_id, status);
    CREATE INDEX IF NOT EXISTS hn_idx_meetings_date ON hn_meetings(meeting_date);
    CREATE INDEX IF NOT EXISTS hn_idx_users_status ON hn_users(status);
  `);

  await runMigrations(pool);

  const stores = await pool.query<{ count: string }>("SELECT COUNT(*) as count FROM hn_stores");
  if (Number(stores.rows[0]?.count || 0) === 0) {
    await pool.query(`
      INSERT INTO hn_stores (name, short_name, color, sort_order) VALUES
      ('GO AUTO OFFICIAL', 'GO AUTO', '#4285f4', 1),
      ('Pusat Interior Mobil88', 'Pusat Interior', '#ea4335', 2),
      ('Hosela Official Store', 'Hosela', '#fbbc04', 3),
      ('Mobela Official Store', 'Mobela', '#34a853', 4)
    `);
  }

  await seedPostgresHistoricalData(pool);

  const users = await pool.query<{ count: string }>("SELECT COUNT(*) as count FROM hn_users");
  if (Number(users.rows[0]?.count || 0) === 0) {
    const hash = bcrypt.hashSync("hosela123", 10);
    await pool.query(
      "INSERT INTO hn_users (username, password_hash, role, department, status, name, email) VALUES ($1, $2, 'owner', 'kepala_gudang', 'active', 'Sanjaya', NULL)",
      ["sanjaya", hash]
    );
  }

  await seedPostgresPermissions();
}

async function runMigrations(pool: Pool) {
  const actionCols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'hn_meeting_action_items' AND column_name = 'note_id'`
  );
  if (actionCols.rows.length === 0) {
    await pool.query(`ALTER TABLE hn_meeting_action_items ADD COLUMN note_id INTEGER REFERENCES hn_admin_notes(id)`);
  }

  const noteTaskCol = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'hn_admin_notes' AND column_name = 'task_id'`
  );
  if (noteTaskCol.rows.length === 0) {
    await pool.query(`ALTER TABLE hn_admin_notes ADD COLUMN task_id INTEGER REFERENCES hn_tasks(id) ON DELETE SET NULL`);
  }

  const weekStartCol = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'hn_perfect_week' AND column_name = 'week_start'`
  );
  if (weekStartCol.rows.length === 0) {
    await pool.query(`ALTER TABLE hn_perfect_week ADD COLUMN week_start TEXT`);
    await pool.query(`UPDATE hn_perfect_week SET week_start = to_char(date_trunc('week', now()) - interval '1 day', 'YYYY-MM-DD') WHERE week_start IS NULL`);
  }
}

async function seedPostgresHistoricalData(pool: Pool) {
  const existing = await pool.query<{ count: string }>("SELECT COUNT(*) as count FROM hn_daily_shipments");
  if (Number(existing.rows[0]?.count || 0) > 0) return;

  const stores = await pool.query<{ id: number; short_name: string }>(
    "SELECT id, short_name FROM hn_stores ORDER BY sort_order"
  );
  const storeMap: Record<string, number> = {};
  for (const store of stores.rows) {
    if (store.short_name === "GO AUTO") storeMap.goauto = store.id;
    else if (store.short_name === "Pusat Interior") storeMap.pusat = store.id;
    else if (store.short_name === "Hosela") storeMap.hosela = store.id;
    else if (store.short_name === "Mobela") storeMap.mobela = store.id;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [yearMonth, storeData] of Object.entries(historicalData)) {
      const [year, month] = yearMonth.split("-").map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();

      for (const [storeKey, quantities] of Object.entries(storeData)) {
        const storeId = storeMap[storeKey];
        if (!storeId) continue;

        for (let day = 1; day <= daysInMonth; day++) {
          const quantity = quantities[day - 1] ?? 0;
          if (quantity === 0) continue;

          const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const morning = Math.floor(quantity / 2);
          const afternoon = quantity - morning;
          await client.query(`
            INSERT INTO hn_daily_shipments (
              date, store_id, morning_quantity, afternoon_quantity, quantity, created_by
            )
            VALUES ($1, $2, $3, $4, $5, 'seed')
            ON CONFLICT(date, store_id) DO NOTHING
          `, [date, storeId, morning, afternoon, quantity]);
        }
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedPostgresPermissions() {
  const pool = getPgPool();
  const users = await pool.query<{ id: number; role: string; department: string | null }>(
    "SELECT id, role, department FROM hn_users"
  );

  for (const user of users.rows) {
    const defaults = user.role === "owner"
      ? FEATURES.map((feature) => feature.key)
      : getDefaultPermissions(user.department);

    for (const feature of FEATURES) {
      await pool.query(`
        INSERT INTO hn_user_permissions (user_id, feature, allowed)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, feature) DO NOTHING
      `, [user.id, feature.key, defaults.includes(feature.key) ? 1 : 0]);
    }
  }
}
