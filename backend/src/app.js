const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// DB and routes are loaded AFTER initDb() completes in server.js

const libraryRoutes = require('./routes/library');
const readerRoutes = require('./routes/reader');
const sourcesRoutes = require('./routes/sources');
const gdriveRoutes = require('./routes/gdrive');
const progressRoutes = require('./routes/progress');
const uploadRoutes = require('./routes/upload');

const app = express();

// Ensure data directories exist
const dataDirs = [
  process.env.CACHE_DIR || './data/cache',
  process.env.COVERS_DIR || './data/covers',
  './data/uploads',
  './data/sessions',
];
dataDirs.forEach(dir => {
  const absDir = path.resolve(__dirname, '..', dir);
  if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });
});

// Security
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Logging
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Sessions (file-based store, no native deps)
const sessionsDir = path.resolve(__dirname, '../data/sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
app.use(session({
  store: new FileStore({ path: sessionsDir, ttl: 7 * 24 * 3600, retries: 1 }),
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// Serve covers & cached images statically
app.use('/covers', express.static(path.resolve(__dirname, '../data/covers')));
app.use('/cache', express.static(path.resolve(__dirname, '../data/cache')));

// API Routes
app.use('/api/library', libraryRoutes);
app.use('/api/reader', readerRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/gdrive', gdriveRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
