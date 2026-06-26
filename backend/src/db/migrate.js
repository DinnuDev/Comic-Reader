const db = require('./database');

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
  `);

  console.log('Database migrated successfully');
}

migrate();
module.exports = migrate;
