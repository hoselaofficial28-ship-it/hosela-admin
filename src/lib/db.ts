import Database from "better-sqlite3";
import path from "path";
import bcrypt from "bcryptjs";
import fs from "fs";
import { FEATURES, getDefaultPermissions } from "./permissions";

function getDbPath() {
  const localDbPath = path.join(process.cwd(), "hosela.db");

  if (process.env.VERCEL) {
    const tmpDbPath = path.join("/tmp", "hosela.db");
    if (!fs.existsSync(tmpDbPath) && fs.existsSync(localDbPath)) {
      fs.copyFileSync(localDbPath, tmpDbPath);
    }
    return tmpDbPath;
  }

  return localDbPath;
}

const DB_PATH = getDbPath();

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initializeDatabase(_db);
  }
  return _db;
}

function initializeDatabase(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS daily_shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      morning_quantity INTEGER NOT NULL DEFAULT 0,
      afternoon_quantity INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(date, store_id)
    );

    CREATE TABLE IF NOT EXISTS express_shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      store_id INTEGER REFERENCES stores(id),
      change_type TEXT NOT NULL CHECK(change_type IN ('increase', 'decrease')),
      percentage REAL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS live_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      product_name TEXT,
      platform TEXT DEFAULT 'shopee' CHECK(platform IN ('shopee', 'tiktok')),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS work_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      store_id INTEGER REFERENCES stores(id),
      category TEXT NOT NULL CHECK(category IN ('gangguan', 'izin', 'return', 'lainnya')),
      description TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin' CHECK(role IN ('owner', 'admin')),
      department TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('pending', 'active', 'inactive')),
      name TEXT,
      email TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      feature TEXT NOT NULL,
      allowed INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, feature)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      assigned_to TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
      deadline TEXT,
      reminder_at TEXT,
      reminder_sent INTEGER DEFAULT 0,
      store_id INTEGER REFERENCES stores(id),
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      task_id INTEGER REFERENCES tasks(id),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high')),
      due_date TEXT,
      store_id INTEGER REFERENCES stores(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      meeting_date TEXT NOT NULL,
      participants TEXT,
      agenda TEXT,
      notes TEXT,
      decisions TEXT,
      important_points TEXT,
      store_id INTEGER REFERENCES stores(id),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meeting_action_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      assigned_to TEXT,
      due_date TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
      task_id INTEGER REFERENCES tasks(id),
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_shipments_date ON daily_shipments(date);
    CREATE INDEX IF NOT EXISTS idx_shipments_store ON daily_shipments(store_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
    CREATE INDEX IF NOT EXISTS idx_admin_notes_user ON admin_notes(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_admin_notes_completed ON admin_notes(completed_at);
    CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(meeting_date);
    CREATE INDEX IF NOT EXISTS idx_meeting_actions_meeting ON meeting_action_items(meeting_id, status);
  `);

  migrateDatabase(db);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
  `);

  const storeCount = db.prepare("SELECT COUNT(*) as count FROM stores").get() as { count: number };
  if (storeCount.count === 0) {
    const insertStore = db.prepare("INSERT INTO stores (name, short_name, color, sort_order) VALUES (?, ?, ?, ?)");
    insertStore.run("GO AUTO OFFICIAL", "GO AUTO", "#4285f4", 1);
    insertStore.run("Pusat Interior Mobil88", "Pusat Interior", "#ea4335", 2);
    insertStore.run("Hosela Official Store", "Hosela", "#fbbc04", 3);
    insertStore.run("Mobela Official Store", "Mobela", "#34a853", 4);
  }

  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  if (userCount.count === 0) {
    const hash = bcrypt.hashSync("hosela123", 10);
    const insertUser = db.prepare("INSERT INTO users (username, password_hash, role, name, email) VALUES (?, ?, ?, ?, ?)");
    insertUser.run("sanjaya", hash, "owner", "Sanjaya", null);
  }

  seedUserPermissions(db);
}

function migrateDatabase(db: Database.Database) {
  const userColumns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const columnNames = new Set(userColumns.map((column) => column.name));

  if (!columnNames.has("department")) {
    db.exec("ALTER TABLE users ADD COLUMN department TEXT");
  }

  if (!columnNames.has("status")) {
    db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
  }

  db.prepare("UPDATE users SET status = 'active' WHERE status IS NULL").run();
  db.prepare("UPDATE users SET status = 'active' WHERE status = 'pending'").run();
  db.prepare("UPDATE users SET department = 'kepala_gudang' WHERE role = 'owner' AND department IS NULL").run();

  const shipmentColumns = db.prepare("PRAGMA table_info(daily_shipments)").all() as { name: string }[];
  const shipmentColumnNames = new Set(shipmentColumns.map((column) => column.name));

  if (!shipmentColumnNames.has("morning_quantity")) {
    db.exec("ALTER TABLE daily_shipments ADD COLUMN morning_quantity INTEGER NOT NULL DEFAULT 0");
  }

  if (!shipmentColumnNames.has("afternoon_quantity")) {
    db.exec("ALTER TABLE daily_shipments ADD COLUMN afternoon_quantity INTEGER NOT NULL DEFAULT 0");
  }

  db.prepare(`
    UPDATE daily_shipments
    SET morning_quantity = quantity
    WHERE quantity > 0 AND morning_quantity = 0 AND afternoon_quantity = 0
  `).run();
}

function seedUserPermissions(db: Database.Database) {
  const users = db.prepare("SELECT id, role, department FROM users").all() as { id: number; role: string; department: string | null }[];
  const upsert = db.prepare(`
    INSERT INTO user_permissions (user_id, feature, allowed)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, feature) DO NOTHING
  `);

  const seed = db.transaction(() => {
    for (const user of users) {
      const defaults = user.role === "owner"
        ? FEATURES.map((feature) => feature.key)
        : getDefaultPermissions(user.department);

      for (const feature of FEATURES) {
        upsert.run(user.id, feature.key, defaults.includes(feature.key) ? 1 : 0);
      }
    }
  });

  seed();
}
