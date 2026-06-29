const db = require('./database');
const crypto = require('crypto');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function ensureDefaultAdmin() {
  const adminEmail = (process.env.DEFAULT_ADMIN_EMAIL || 'ops.curator@comixhq.io').trim().toLowerCase();
  const adminUsername = (process.env.DEFAULT_ADMIN_USERNAME || 'vault.curator').trim();
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'R7!mQ2#Lx9@T';

  const existing = db
    .prepare('SELECT id FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)')
    .get(adminEmail, adminUsername);

  if (existing) return;

  db.prepare(
    'INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)'
  ).run(
    crypto.randomUUID(),
    adminEmail,
    adminUsername,
    hashPassword(adminPassword)
  );

  console.log('[auth] Seeded default admin account:', adminEmail);
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('local','gdrive')),
      path TEXT,
      gdrive_folder_id TEXT,
      gdrive_token TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS comics (
      id TEXT PRIMARY KEY,
      source_id TEXT REFERENCES sources(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      file_path TEXT,
      gdrive_file_id TEXT,
      cover_path TEXT,
      page_count INTEGER DEFAULT 0,
      file_type TEXT,
      file_size INTEGER DEFAULT 0,
      series TEXT,
      issue_number TEXT,
      year INTEGER,
      publisher TEXT,
      description TEXT,
      tags TEXT DEFAULT '[]',
      is_favorite INTEGER DEFAULT 0,
      date_added INTEGER DEFAULT (unixepoch()),
      last_read INTEGER,
      metadata TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      id TEXT PRIMARY KEY,
      comic_id TEXT REFERENCES comics(id) ON DELETE CASCADE,
      current_page INTEGER DEFAULT 0,
      total_pages INTEGER DEFAULT 0,
      zoom_state TEXT DEFAULT '{}',
      updated_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(comic_id)
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      comic_id TEXT REFERENCES comics(id) ON DELETE CASCADE,
      page INTEGER NOT NULL,
      label TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_comics_source ON comics(source_id);
    CREATE INDEX IF NOT EXISTS idx_comics_title ON comics(title);
    CREATE INDEX IF NOT EXISTS idx_comics_series ON comics(series);
    CREATE INDEX IF NOT EXISTS idx_comics_last_read ON comics(last_read);
    CREATE INDEX IF NOT EXISTS idx_progress_comic ON reading_progress(comic_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_comic ON bookmarks(comic_id);

    CREATE TABLE IF NOT EXISTS gdrive_accounts (
      id          TEXT PRIMARY KEY,
      email       TEXT NOT NULL UNIQUE,
      name        TEXT,
      picture     TEXT,
      access_token  TEXT NOT NULL,
      refresh_token TEXT,
      expiry_date   INTEGER,
      created_at  INTEGER DEFAULT (unixepoch()),
      updated_at  INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      username      TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    INTEGER DEFAULT (unixepoch())
    );
  `);

  // Add content hash support for duplicate prevention (safe on existing DBs)
  try {
    db.exec('ALTER TABLE comics ADD COLUMN content_hash TEXT');
  } catch {
    // Column already exists
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_comics_content_hash
    ON comics(content_hash)
    WHERE content_hash IS NOT NULL;
  `);

  // Best-effort case-insensitive username uniqueness for predictable username login.
  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci
      ON users(lower(username));
    `);
  } catch {
    // Existing duplicate usernames may prevent index creation.
  }

  ensureDefaultAdmin();

  console.log('Database migrated successfully');
}

migrate();
module.exports = migrate;
