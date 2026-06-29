'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const comicService = require('../services/comicService');

const UPLOADS_DIR = path.resolve(__dirname, '../../data/uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_EXTS = ['.cbz', '.cbr', '.zip', '.pdf'];

// 5 GB limit
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;

function normalizeComicTitle(fileName) {
  // Strip leading timestamp prefix added by storage naming, e.g. 1782718397000_Title.cbz
  return fileName.replace(/^\d{10,}_/, '');
}

function hashFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// ── Multer: stream directly to disk, no memory buffering ─────────────────
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename(req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 10 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      return cb(new Error(`Unsupported type: ${ext}. Allowed: ${ALLOWED_EXTS.join(', ')}`));
    }
    cb(null, true);
  },
});

function getOrCreateUploadSource() {
  let source = db.prepare(`SELECT * FROM sources WHERE type = 'local' AND path = ?`).get(UPLOADS_DIR);
  if (!source) {
    const id = uuidv4();
    db.prepare(`INSERT INTO sources (id, name, type, path) VALUES (?, ?, 'local', ?)`)
      .run(id, 'Uploads', UPLOADS_DIR);
    source = db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
  }
  return source;
}

// ── POST /api/upload ──────────────────────────────────────────────────────
// Files are streamed to disk by multer. For large files we:
//   1. Register the comic in the DB immediately (page_count = 0 for >200MB)
//   2. Start background page-counting + cover generation
//   3. Return to the client right away — no waiting for processing
router.post('/', upload.array('files', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files received.' });
  }

  const source = getOrCreateUploadSource();
  const results = [];
  const errors = [];

  for (const file of req.files) {
    try {
      const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
      const title = normalizeComicTitle(
        path.basename(file.originalname, path.extname(file.originalname))
      );
      const filePath = file.path;
      const isLarge = file.size > 200 * 1024 * 1024; // > 200 MB
      const contentHash = await hashFileSha256(filePath);

      // Skip duplicate uploads by file contents, regardless of filename/path.
      const existing = db.prepare('SELECT id, title FROM comics WHERE content_hash = ?').get(contentHash);
      if (existing) {
        try { fs.unlinkSync(filePath); } catch {}
        results.push({ id: existing.id, title: existing.title || title, status: 'duplicate' });
        continue;
      }

      const id = uuidv4();

      // For large files: register immediately with page_count=0, process async
      // For normal files: count pages synchronously before responding
      let pageCount = 0;
      if (!isLarge) {
        pageCount = await comicService.countPagesPublic(filePath, ext);
      }

      db.prepare(`
        INSERT INTO comics (id, source_id, title, file_path, file_type, file_size, page_count, content_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, source.id, title, filePath, ext, file.size, pageCount, contentHash);

      // Always generate cover async
      comicService.generateCoverAsync(id, filePath, ext);

      // Count pages in background whenever still unknown.
      // This covers both large files and edge cases where sync counting
      // returns 0 for a file that can still be processed asynchronously.
      if (isLarge || pageCount === 0) {
        comicService.updatePageCountAsync(id, filePath, ext);
      }

      results.push({
        id,
        title,
        file_type: ext,
        file_size: file.size,
        page_count: pageCount,
        processing: isLarge || pageCount === 0, // true = counting pages in background
        status: 'added',
      });
    } catch (err) {
      console.error('[upload] Error registering file:', err.message);
      errors.push({ file: file.originalname, error: err.message });
      try { fs.unlinkSync(file.path); } catch {}
    }
  }

  res.json({
    added: results.filter(r => r.status === 'added').length,
    results,
    errors,
  });
});

// ── GET /api/upload/status/:comicId ──────────────────────────────────────
// Poll this to check if background page-counting has finished for large files.
router.get('/status/:comicId', (req, res) => {
  const comic = db.prepare('SELECT id, page_count, cover_path FROM comics WHERE id = ?')
    .get(req.params.comicId);
  if (!comic) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: comic.id,
    page_count: comic.page_count,
    cover_ready: !!comic.cover_path,
    processing: comic.page_count === 0,
  });
});

// ── DELETE /api/upload/:comicId ───────────────────────────────────────────
router.delete('/:comicId', (req, res) => {
  const comic = db.prepare(`
    SELECT c.*, s.path as source_path
    FROM comics c JOIN sources s ON c.source_id = s.id
    WHERE c.id = ? AND s.type = 'local' AND s.path = ?
  `).get(req.params.comicId, UPLOADS_DIR);

  if (!comic) return res.status(404).json({ error: 'Upload not found' });

  try { if (fs.existsSync(comic.file_path)) fs.unlinkSync(comic.file_path); } catch {}
  db.prepare('DELETE FROM comics WHERE id = ?').run(req.params.comicId);
  res.json({ success: true });
});

// ── Multer error handler ──────────────────────────────────────────────────
// Catches errors from the upload middleware BEFORE they reach the global handler.
// Handles both multer v1 and v2 error shapes.
router.use((err, req, res, next) => {
  const isFileSizeError =
    err.code === 'LIMIT_FILE_SIZE' ||
    (err.message && err.message.toLowerCase().includes('file too large'));

  if (isFileSizeError) {
    return res.status(413).json({
      error: `File too large. Maximum allowed size is ${(MAX_FILE_SIZE / 1024 / 1024 / 1024).toFixed(0)} GB.`,
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many files. Upload up to 10 files at once.' });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected field name in upload request.' });
  }

  // Pass any other errors to the global handler
  next(err);
});

module.exports = router;
