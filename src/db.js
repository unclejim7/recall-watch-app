const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || (
  process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, '..', 'data.sqlite')
);

const db = new Database(DB_PATH);
if (DB_PATH !== ':memory:') db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS watched_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('consumer_product','vehicle','food','drug')),
  label TEXT NOT NULL,
  criteria_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sent_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watched_item_id INTEGER NOT NULL REFERENCES watched_items(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  recall_id TEXT NOT NULL,
  sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(watched_item_id, source, recall_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

module.exports = { db, getSetting, setSetting };
