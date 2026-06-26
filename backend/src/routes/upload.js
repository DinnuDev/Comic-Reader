const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const comicService = require('../services/comicService');

const UPLOADS_DIR = path.resolve(__dirname, '../../data/uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_EXTS = ['.cbz', '.cbr', '.zip', '.pdf'];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

// Multer storage: keep original filename (sanitized)
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename(req, file, cb) {
    // Sanitize filename
    const safe = file.originalname.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      return cb(new Error(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTS.join(', ')}`));
    }
    cb(null, true);
  },
});

// Ensure an "Uploads" source exists
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

// POST /api/upload - upload one or more comic files
router.post('/', upload.array('files', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const source = getOrCreateUploadSource();
  const results = [];
  const errors = [];

  for (const file of req.files) {
    try {
      const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
      const title = path.basename(file.originalname, path.extname(file.originalname));
      const filePath = file.path;

      // Check for duplicate
      const existing = db.prepare('SELECT id FROM comics WHERE file_path = ?').get(filePath);
      if (existing) {
        results.push({ id: existing.id, title, status: 'duplicate' });
        continue;
      }

      const id = uuidv4();
      const pageCount = await comicService.countPagesPublic(filePath, ext);

      db.prepare(`
        INSERT INTO comics (id, source_id, title, file_path, file_type, file_size, page_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, source.id, title, filePath, ext, file.size, pageCount);

      // Generate cover async (non-blocking)
      comicService.generateCoverAsync(id, filePath, ext);

      results.push({ id, title, file_type: ext, page_count: pageCount, status: 'added' });
    } catch (err) {
      errors.push({ file: file.originalname, error: err.message });
      // Remove the uploaded file if registration failed
      try { fs.unlinkSync(file.path); } catch {}
    }
  }

  res.status(200).json({ added: results.filter(r => r.status === 'added').length, results, errors });
});

// DELETE /api/upload/:comicId - remove uploaded comic (deletes file too)
router.delete('/:comicId', (req, res) => {
  const comic = db.prepare(`
    SELECT c.*, s.path as source_path
    FROM comics c JOIN sources s ON c.source_id = s.id
    WHERE c.id = ? AND s.type = 'local' AND s.path = ?
  `).get(req.params.comicId, UPLOADS_DIR);

  if (!comic) return res.status(404).json({ error: 'Upload not found' });

  // Delete the file
  try { if (fs.existsSync(comic.file_path)) fs.unlinkSync(comic.file_path); } catch {}

  db.prepare('DELETE FROM comics WHERE id = ?').run(req.params.comicId);
  res.json({ success: true });
});

// Error handler for multer
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB` });
  }
  res.status(400).json({ error: err.message });
});

module.exports = router;
