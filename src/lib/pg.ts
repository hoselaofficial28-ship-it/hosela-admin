import { Pool, type PoolClient, type QueryResultRow } from "pg";
import bcrypt from "bcryptjs";
import { FEATURES, getDefaultPermissions } from "./permissions";

const globalForPg = globalThis as unknown as {
  hoselaPgPool?: Pool;
  hoselaPgInitialized?: Promise<void>;
};

export function hasPostgres() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL);
}

function getConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
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
    globalForPg.hoselaPgInitialized = initializePostgres();
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
      created_at TIMESTAMPTZ DEFAULT now(),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS hn_idx_shipments_date ON hn_daily_shipments(date);
    CREATE INDEX IF NOT EXISTS hn_idx_shipments_store ON hn_daily_shipments(store_id);
    CREATE INDEX IF NOT EXISTS hn_idx_tasks_status ON hn_tasks(status);
    CREATE INDEX IF NOT EXISTS hn_idx_notifications_user ON hn_notifications(user_id, read);
    CREATE INDEX IF NOT EXISTS hn_idx_admin_notes_user ON hn_admin_notes(user_id, status);
    CREATE INDEX IF NOT EXISTS hn_idx_meetings_date ON hn_meetings(meeting_date);
    CREATE INDEX IF NOT EXISTS hn_idx_users_status ON hn_users(status);
  `);

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
