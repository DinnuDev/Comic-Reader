/**
 * SQLite wrapper using sql.js (pure WebAssembly — no native compilation).
 * Call initDb() once at startup, then use the synchronous API below.
 */
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '../../', process.env.DB_PATH || 'data/comic-reader.db');
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let rawDb = null;
let dirty = false;

// Periodic auto-save every 5 seconds when dirty
setInterval(() => {
  if (dirty && rawDb) { persistDb(); dirty = false; }
}, 5000);

function persistDb() {
  try {
    const data = rawDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {
    console.error('[db] persist error:', e.message);
  }
}

/** Initialize sql.js and load (or create) the database file. */
async function initDb() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    rawDb = new SQL.Database(buf);
  } else {
    rawDb = new SQL.Database();
  }
  rawDb.run('PRAGMA foreign_keys = ON');
  console.log('[db] Initialized:', DB_PATH);
}

/** Flush to disk immediately (call on shutdown or after bulk writes). */
function flushDb() {
  if (rawDb) persistDb();
}

// ── Synchronous better-sqlite3-compatible API ──────────────────────────────

function prepare(sql) {
  return {
    get(...args) {
      assertReady();
      const params = normalizeParams(args);
      const stmt = rawDb.prepare(sql);
      stmt.bind(params);
      let row = undefined;
      if (stmt.step()) row = stmt.getAsObject();
      stmt.free();
      return row;
    },
    all(...args) {
      assertReady();
      const params = normalizeParams(args);
      const stmt = rawDb.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
    run(...args) {
      assertReady();
      const params = normalizeParams(args);
      rawDb.run(sql, params);
      dirty = true;
      return { changes: rawDb.getRowsModified() };
    },
  };
}

function exec(sql) {
  assertReady();
  rawDb.run(sql);
  dirty = true;
}

function assertReady() {
  if (!rawDb) throw new Error('Database not initialized. Call initDb() first.');
}

function normalizeParams(args) {
  if (args.length === 0) return [];
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

const db = { prepare, exec, pragma: () => {}, flushDb };

module.exports = db;
module.exports.initDb = initDb;
module.exports.flushDb = flushDb;
