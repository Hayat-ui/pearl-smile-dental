const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'pearlcare.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      email       TEXT    NOT NULL UNIQUE,
      password    TEXT    NOT NULL,
      created_at  TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name    TEXT    NOT NULL,
      last_name     TEXT    NOT NULL,
      phone         TEXT    NOT NULL,
      email         TEXT    NOT NULL,
      appt_date     TEXT    NOT NULL,
      appt_time     TEXT    NOT NULL,
      service       TEXT    NOT NULL,
      notes         TEXT,
      status        TEXT    DEFAULT 'pending',   -- pending | confirmed | cancelled | completed
      sheets_synced INTEGER DEFAULT 0,
      created_at    TEXT    DEFAULT (datetime('now')),
      updated_at    TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id    INTEGER REFERENCES admins(id),
      action      TEXT NOT NULL,
      target_id   INTEGER,
      detail      TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed default admin from .env if not exists
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@pearlcare.com';
  const adminPass  = process.env.ADMIN_PASSWORD || 'Admin@1234';

  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(adminEmail);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPass, 12);
    db.prepare(`
      INSERT INTO admins (name, email, password)
      VALUES (?, ?, ?)
    `).run('Admin', adminEmail, hash);
    console.log(`✅  Default admin created: ${adminEmail}`);
  }

  console.log('✅  Database initialised:', DB_PATH);
}

module.exports = { db, initDb };
