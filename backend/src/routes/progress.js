const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');

// GET /api/progress/:comicId
router.get('/:comicId', (req, res) => {
  const progress = db.prepare('SELECT * FROM reading_progress WHERE comic_id = ?').get(req.params.comicId);
  if (!progress) return res.json({ comic_id: req.params.comicId, current_page: 0, total_pages: 0 });
  res.json({ ...progress, zoom_state: JSON.parse(progress.zoom_state || '{}') });
});

// PUT /api/progress/:comicId
router.put('/:comicId', (req, res) => {
  const { current_page, total_pages, zoom_state } = req.body;
  const existing = db.prepare('SELECT id FROM reading_progress WHERE comic_id = ?').get(req.params.comicId);

  if (existing) {
    db.prepare(`
      UPDATE reading_progress
      SET current_page = ?, total_pages = ?, zoom_state = ?, updated_at = unixepoch()
      WHERE comic_id = ?
    `).run(current_page ?? 0, total_pages ?? 0, JSON.stringify(zoom_state || {}), req.params.comicId);
  } else {
    db.prepare(`
      INSERT INTO reading_progress (id, comic_id, current_page, total_pages, zoom_state)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), req.params.comicId, current_page ?? 0, total_pages ?? 0, JSON.stringify(zoom_state || {}));
  }

  // Update last_read on comic
  db.prepare('UPDATE comics SET last_read = unixepoch() WHERE id = ?').run(req.params.comicId);

  res.json({ success: true });
});

// GET /api/progress/:comicId/bookmarks
router.get('/:comicId/bookmarks', (req, res) => {
  const bookmarks = db.prepare('SELECT * FROM bookmarks WHERE comic_id = ? ORDER BY page').all(req.params.comicId);
  res.json(bookmarks);
});

// POST /api/progress/:comicId/bookmarks
router.post('/:comicId/bookmarks', (req, res) => {
  const { page, label } = req.body;
  if (page === undefined) return res.status(400).json({ error: 'page is required' });
  const id = uuidv4();
  db.prepare('INSERT OR REPLACE INTO bookmarks (id, comic_id, page, label) VALUES (?, ?, ?, ?)').run(id, req.params.comicId, page, label || null);
  res.status(201).json({ id, comic_id: req.params.comicId, page, label });
});

// DELETE /api/progress/:comicId/bookmarks/:bookmarkId
router.delete('/:comicId/bookmarks/:bookmarkId', (req, res) => {
  db.prepare('DELETE FROM bookmarks WHERE id = ? AND comic_id = ?').run(req.params.bookmarkId, req.params.comicId);
  res.json({ success: true });
});

module.exports = router;
