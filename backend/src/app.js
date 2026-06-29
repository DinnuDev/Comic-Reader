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
const setupRoutes = require('./routes/setup');

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

const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || [
  'http://localhost:5173',
  'https://comic-reader-fkbe.onrender.com',
]).toString().split(',').map(origin => origin.trim()).filter(Boolean);

// CORS
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
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
app.use('/api/setup', setupRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Root endpoint for platform/browser probes
app.get('/', (req, res) => {
  res.type('html').send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Comic Reader API</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #0a0a0a;
            color: #e5e5e5;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          }
          main {
            max-width: 680px;
            padding: 32px;
            text-align: center;
          }
          h1 {
            margin: 0 0 12px;
            font-size: 32px;
          }
          p {
            margin: 0 0 18px;
            color: rgba(255, 255, 255, 0.72);
            line-height: 1.6;
          }
          a {
            color: #ff5a68;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Comic Reader API</h1>
          <p>This service is running successfully. Use the frontend application to browse your library and the API endpoints for integrations.</p>
          <p>Health check: <a href="/api/health">/api/health</a></p>
        </main>
      </body>
    </html>
  `);
});

// Favicon probe from browsers
app.get('/favicon.ico', (req, res) => res.status(204).end());

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler — catches both app errors and multer upload errors
app.use((err, req, res, next) => {
  // Multer file-size exceeded (LIMIT_FILE_SIZE)
  const isFileSizeError =
    err.code === 'LIMIT_FILE_SIZE' ||
    (err.message && err.message.toLowerCase().includes('file too large'));

  if (isFileSizeError) {
    return res.status(413).json({
      error: 'File too large. Maximum allowed size is 5 GB.',
    });
  }

  // Multer file-count exceeded
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many files. Maximum is 10 per upload.' });
  }

  // Generic
  console.error('[error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
