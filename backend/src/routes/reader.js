const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/database');
const comicService = require('../services/comicService');

// GET /api/reader/:comicId/pages - get page count & metadata
router.get('/:comicId/pages', async (req, res) => {
  const comic = db.prepare('SELECT * FROM comics WHERE id = ?').get(req.params.comicId);
  if (!comic) return res.status(404).json({ error: 'Comic not found' });

  try {
    const pages = await comicService.getPageList(comic);
    db.prepare('UPDATE comics SET last_read = unixepoch() WHERE id = ?').run(comic.id);

    // Cache-control: pages list rarely changes
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ comicId: comic.id, title: comic.title, pages, total: pages.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reader/:comicId/page/:pageNum - stream a single page image
router.get('/:comicId/page/:pageNum', async (req, res) => {
  const comic = db.prepare('SELECT * FROM comics WHERE id = ?').get(req.params.comicId);
  if (!comic) return res.status(404).json({ error: 'Comic not found' });

  const pageNum = parseInt(req.params.pageNum);
  if (isNaN(pageNum) || pageNum < 0) return res.status(400).json({ error: 'Invalid page number' });

  // Strong ETag: comicId + pageNum + file modification time
  const etag = `"${comic.id}-${pageNum}-${comic.date_added || 0}"`;
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  try {
    const { buffer, mimeType } = await comicService.getPage(comic, pageNum);
    res.set('Content-Type', mimeType);
    res.set('ETag', etag);
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    res.set('Vary', 'Accept-Encoding');
    res.send(buffer);
  } catch (err) {
    console.error('Page fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reader/:comicId/cover - get cover image
router.get('/:comicId/cover', async (req, res) => {
  const comic = db.prepare('SELECT * FROM comics WHERE id = ?').get(req.params.comicId);
  if (!comic) return res.status(404).json({ error: 'Comic not found' });

  try {
    const { buffer, mimeType } = await comicService.getCover(comic);
    const coverEtag = `"cover-${comic.id}-${comic.date_added || 0}"`;
    if (req.headers['if-none-match'] === coverEtag) return res.status(304).end();
    res.set('Content-Type', mimeType);
    res.set('ETag', coverEtag);
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
