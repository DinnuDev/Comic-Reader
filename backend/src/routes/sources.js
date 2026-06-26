const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// GET /api/sources - list all sources
router.get('/', (req, res) => {
  const sources = db.prepare(`
    SELECT s.*, COUNT(c.id) as comic_count
    FROM sources s
    LEFT JOIN comics c ON c.source_id = s.id
    GROUP BY s.id ORDER BY s.name
  `).all();
  res.json(sources);
});

// POST /api/sources - add a new source
router.post('/', (req, res) => {
  const { name, type, path: folderPath, gdrive_folder_id } = req.body;

  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
  if (!['local', 'gdrive'].includes(type)) return res.status(400).json({ error: 'type must be local or gdrive' });

  if (type === 'local') {
    if (!folderPath) return res.status(400).json({ error: 'path required for local source' });
    const absPath = path.resolve(folderPath);
    if (!fs.existsSync(absPath)) return res.status(400).json({ error: `Path does not exist: ${absPath}` });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO sources (id, name, type, path, gdrive_folder_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, type, folderPath || null, gdrive_folder_id || null);

  const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
  res.status(201).json(source);
});

// PUT /api/sources/:id - update source
router.put('/:id', (req, res) => {
  const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });

  const { name, path: folderPath, gdrive_folder_id } = req.body;
  db.prepare(`
    UPDATE sources SET name = ?, path = ?, gdrive_folder_id = ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(name || source.name, folderPath || source.path, gdrive_folder_id || source.gdrive_folder_id, req.params.id);

  res.json(db.prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id));
});

// DELETE /api/sources/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM sources WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
