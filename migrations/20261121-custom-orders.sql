-- Replace __PREFIX__ with hn_ for PostgreSQL, or empty string for SQLite.
-- Additive only: existing operational tables are not modified.
CREATE TABLE IF NOT EXISTS __PREFIX__custom_orders (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL,
  order_ref TEXT NOT NULL,
  ship_date TEXT NOT NULL,
  notes TEXT NOT NULL,
  image TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'issue', 'done')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS __PREFIX__custom_order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES __PREFIX__custom_orders(id),
  revision INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'read', 'completed', 'issue')),
  actor_id INTEGER NOT NULL,
  actor_name TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  snapshot TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS __PREFIX__custom_orders_status_idx ON __PREFIX__custom_orders(status, ship_date);
CREATE INDEX IF NOT EXISTS __PREFIX__custom_events_order_idx ON __PREFIX__custom_order_events(order_id, revision, actor_id, day);
