-- mint-lite database schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plaid_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT,
  type TEXT,
  subtype TEXT,
  mask TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  item_id TEXT,
  account_id TEXT,
  transaction_id TEXT UNIQUE NOT NULL,
  name TEXT,
  merchant TEXT,
  amount REAL,
  iso_currency TEXT,
  posted_at TEXT,
  raw_category TEXT,
  ai_category TEXT,
  ai_confidence REAL,
  created_at TEXT NOT NULL
);

-- Seed default user
INSERT OR IGNORE INTO users (id, created_at)
VALUES ('user-1', datetime('now'));
