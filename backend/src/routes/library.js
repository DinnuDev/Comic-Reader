const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const comicService = require('../services/comicService');

// GET /api/library - list all comics with optional filters
router.get('/', (req, res) => {
  const { search, source, series, favorite, sort = 'title', order = 'asc', page = 1, limit = 50 } = req.query;

  let query = `
    SELECT c.*, s.name as source_name, s.type as source_type,
           p.current_page, p.total_pages
    FROM comics c
    LEFT JOIN sources s ON c.source_id = s.id
    LEFT JOIN reading_progress p ON p.comic_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ` AND (c.title LIKE ? OR c.series LIKE ? OR c.publisher LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (source) { query += ` AND c.source_id = ?`; params.push(source); }
  if (series) { query += ` AND c.series = ?`; params.push(series); }
  if (favorite === 'true') { query += ` AND c.is_favorite = 1`; }

  const validSort = ['title', 'date_added', 'last_read', 'series', 'year'].includes(sort) ? sort : 'title';
  const validOrder = order === 'desc' ? 'DESC' : 'ASC';
  query += ` ORDER BY c.${validSort} ${validOrder}`;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  query += ` LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  const comics = db.prepare(query).all(...params);
  const total = db.prepare(`SELECT COUNT(*) as count FROM comics WHERE 1=1`).get()?.count ?? 0;

  const safeParse = (val, fallback) => { try { return JSON.parse(val || fallback); } catch { return JSON.parse(fallback); } };

  res.json({
    comics: comics.map(c => ({ ...c, tags: safeParse(c.tags, '[]'), metadata: safeParse(c.metadata, '{}') })),
    total,
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

// GET /api/library/recent - recently read
router.get('/recent', (req, res) => {
  const comics = db.prepare(`
    SELECT c.*, s.name as source_name, p.current_page, p.total_pages
    FROM comics c
    LEFT JOIN sources s ON c.source_id = s.id
    LEFT JOIN reading_progress p ON p.comic_id = c.id
    WHERE c.last_read IS NOT NULL
    ORDER BY c.last_read DESC LIMIT 20
  `).all();
  res.json(comics.map(c => ({ ...c, tags: JSON.parse(c.tags || '[]') })));
});

// GET /api/library/series - list all series
router.get('/series', (req, res) => {
  const series = db.prepare(`
    SELECT series, COUNT(*) as count, MIN(cover_path) as cover
    FROM comics WHERE series IS NOT NULL AND series != ''
    GROUP BY series ORDER BY series
  `).all();
  res.json(series);
});

// GET /api/library/:id - single comic
router.get('/:id', (req, res) => {
  const comic = db.prepare(`
    SELECT c.*, s.name as source_name, s.type as source_type,
           p.current_page, p.total_pages
    FROM comics c
    LEFT JOIN sources s ON c.source_id = s.id
    LEFT JOIN reading_progress p ON p.comic_id = c.id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!comic) return res.status(404).json({ error: 'Comic not found' });
  res.json({ ...comic, tags: JSON.parse(comic.tags || '[]'), metadata: JSON.parse(comic.metadata || '{}') });
});

// PATCH /api/library/:id/favorite
router.patch('/:id/favorite', (req, res) => {
  const comic = db.prepare('SELECT id, is_favorite FROM comics WHERE id = ?').get(req.params.id);
  if (!comic) return res.status(404).json({ error: 'Comic not found' });
  const newFav = comic.is_favorite ? 0 : 1;
  db.prepare('UPDATE comics SET is_favorite = ? WHERE id = ?').run(newFav, req.params.id);
  res.json({ is_favorite: !!newFav });
});

// DELETE /api/library/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM comics WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/library/scan/:sourceId - scan source for comics
router.post('/scan/:sourceId', async (req, res) => {
  const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(req.params.sourceId);
  if (!source) return res.status(404).json({ error: 'Source not found' });

  try {
    const added = await comicService.scanSource(source);
    // After scan, return list of newly processing comics so the frontend
    // can display ghost cards immediately without a separate library fetch.
    const processingComics = db.prepare(`
      SELECT id, title, file_type, file_size, page_count
      FROM comics WHERE source_id = ? AND page_count = 0
      ORDER BY date_added DESC
    `).all(source.id);

    res.json({
      added,
      message: `Scanned "${source.name}" — added ${added} comic${added !== 1 ? 's' : ''}.`,
      processing: processingComics,
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
