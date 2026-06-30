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
const authRoutes = require('./routes/auth');
const requireAuth = require('./middleware/requireAuth');

const app = express();
app.set('trust proxy', 1);
const frontendDistDir = path.resolve(__dirname, '../../frontend/dist');
const frontendIndexPath = path.join(frontendDistDir, 'index.html');
const hasFrontendBuild = fs.existsSync(frontendIndexPath);

// Ensure data directories exist
const resolveDataDir = (envVar, fallback) =>
  process.env[envVar] ? path.resolve(process.env[envVar]) : path.resolve(__dirname, '..', fallback);

const dataDirs = [
  resolveDataDir('CACHE_DIR', './data/cache'),
  resolveDataDir('COVERS_DIR', './data/covers'),
  resolveDataDir('UPLOADS_DIR', './data/uploads'),
  resolveDataDir('SESSIONS_DIR', './data/sessions'),
];
dataDirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Security
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const defaultAllowedOrigins = [
  'http://localhost:5173',
  'https://comic-reader-fkbe.onrender.com',
];

const configuredOrigins = [process.env.FRONTEND_URLS, process.env.FRONTEND_URL]
  .filter(Boolean)
  .join(',')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([
  ...defaultAllowedOrigins,
  ...configuredOrigins,
]));

function isRenderOrigin(origin) {
  return /^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(origin);
}

// CORS
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || isRenderOrigin(origin)) {
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
const sessionsDir = resolveDataDir('SESSIONS_DIR', '../data/sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
app.use(session({
  store: new FileStore({ path: sessionsDir, ttl: 7 * 24 * 3600, retries: 1 }),
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// Serve covers & cached images statically
app.use('/covers', requireAuth, express.static(path.resolve(__dirname, '../data/covers')));
app.use('/cache', requireAuth, express.static(path.resolve(__dirname, '../data/cache')));

// Public auth routes
app.use('/api/auth', authRoutes);

// API Routes
app.use('/api/library', requireAuth, libraryRoutes);
app.use('/api/reader', requireAuth, readerRoutes);
app.use('/api/sources', requireAuth, sourcesRoutes);
app.use('/api/gdrive', requireAuth, gdriveRoutes);
app.use('/api/progress', requireAuth, progressRoutes);
app.use('/api/upload', requireAuth, uploadRoutes);
app.use('/api/setup', requireAuth, setupRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

if (hasFrontendBuild) {
  app.use('/assets', express.static(path.join(frontendDistDir, 'assets'), {
    fallthrough: false,
    maxAge: '1y',
    immutable: true,
  }));

  app.use(express.static(frontendDistDir, { index: false }));

  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/assets') ||
      req.path.startsWith('/covers') ||
      req.path.startsWith('/cache')
    ) {
      return next();
    }

    // Do not serve index.html for explicit file requests (e.g. *.js, *.css, *.map)
    if (path.extname(req.path)) {
      return res.status(404).end();
    }

    return res.sendFile(frontendIndexPath, (err) => {
      if (err) return next(err);
    });
  });
} else {
  // Root endpoint for platform/browser probes when no frontend build is present
  app.get('/', (req, res) => {
    res.json({
      service: 'Comic Reader API',
      status: 'ok',
      health: '/api/health',
    });
  });
}

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
