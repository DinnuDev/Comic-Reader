const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const gdriveService = require('../services/gdriveService');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';

// GET /api/gdrive/config-status - is the server configured with credentials?
router.get('/config-status', (req, res) => {
  res.json({ configured: gdriveService.isConfigured() });
});

// GET /api/gdrive/auth - get OAuth2 URL
router.get('/auth', (req, res) => {
  try {
    const url = gdriveService.getAuthUrl();
    res.json({ url });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// GET /api/gdrive/callback - OAuth2 callback
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND}?gdrive=error&reason=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return res.redirect(`${FRONTEND}?gdrive=error&reason=no_code`);
  }

  try {
    const tokens = await gdriveService.exchangeCode(code);
    req.session.gdriveTokens = tokens;

    // Fetch user info and attach to session
    try {
      const userInfo = await gdriveService.getUserInfo(tokens);
      req.session.gdriveUser = { email: userInfo.email, picture: userInfo.picture };
    } catch (_) { /* user info is optional */ }

    req.session.save(() => {
      res.redirect(`${FRONTEND}?gdrive=connected`);
    });
  } catch (err) {
    console.error('[gdrive] Token exchange error:', err.message);
    const reason = err.message.includes('invalid_grant') ? 'invalid_grant' : encodeURIComponent(err.message);
    res.redirect(`${FRONTEND}?gdrive=error&reason=${reason}`);
  }
});

// GET /api/gdrive/status
router.get('/status', (req, res) => {
  const connected = !!(req.session?.gdriveTokens?.access_token);
  res.json({
    connected,
    configured: gdriveService.isConfigured(),
    user: req.session?.gdriveUser || null,
  });
});

// POST /api/gdrive/disconnect
router.post('/disconnect', (req, res) => {
  delete req.session.gdriveTokens;
  delete req.session.gdriveUser;
  res.json({ success: true });
});

// GET /api/gdrive/folders - list folders
router.get('/folders', async (req, res) => {
  if (!req.session?.gdriveTokens) return res.status(401).json({ error: 'Not authenticated with Google Drive' });
  const { parent = 'root' } = req.query;
  try {
    const folders = await gdriveService.listFolders(req.session.gdriveTokens, parent);
    res.json(folders);
  } catch (err) {
    if (err.code === 401 || err.status === 401) {
      delete req.session.gdriveTokens;
      return res.status(401).json({ error: 'Google Drive session expired. Please reconnect.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gdrive/files - list comic files in a folder
router.get('/files', async (req, res) => {
  if (!req.session?.gdriveTokens) return res.status(401).json({ error: 'Not authenticated with Google Drive' });
  const { folderId = 'root' } = req.query;
  try {
    const files = await gdriveService.listComicFiles(req.session.gdriveTokens, folderId);
    res.json(files);
  } catch (err) {
    if (err.code === 401 || err.status === 401) {
      delete req.session.gdriveTokens;
      return res.status(401).json({ error: 'Google Drive session expired. Please reconnect.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gdrive/page - stream a page from Google Drive comic
router.get('/page', async (req, res) => {
  if (!req.session?.gdriveTokens) return res.status(401).json({ error: 'Not authenticated' });
  const { fileId, page } = req.query;
  if (!fileId || page === undefined) return res.status(400).json({ error: 'fileId and page required' });
  try {
    const { buffer, mimeType } = await gdriveService.getPage(req.session.gdriveTokens, fileId, parseInt(page));
    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


// GET /api/gdrive/auth - get OAuth2 URL
router.get('/auth', (req, res) => {
  const url = gdriveService.getAuthUrl();
  res.json({ url });
});

// GET /api/gdrive/callback - OAuth2 callback
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    const tokens = await gdriveService.exchangeCode(code);
    req.session.gdriveTokens = tokens;
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?gdrive=connected`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gdrive/status
router.get('/status', (req, res) => {
  const connected = !!(req.session.gdriveTokens);
  res.json({ connected });
});

// GET /api/gdrive/disconnect
router.post('/disconnect', (req, res) => {
  delete req.session.gdriveTokens;
  res.json({ success: true });
});

// GET /api/gdrive/folders - list folders
router.get('/folders', async (req, res) => {
  if (!req.session.gdriveTokens) return res.status(401).json({ error: 'Not authenticated with Google Drive' });

  const { parent = 'root' } = req.query;
  try {
    const folders = await gdriveService.listFolders(req.session.gdriveTokens, parent);
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gdrive/files - list comic files in a folder
router.get('/files', async (req, res) => {
  if (!req.session.gdriveTokens) return res.status(401).json({ error: 'Not authenticated with Google Drive' });

  const { folderId = 'root' } = req.query;
  try {
    const files = await gdriveService.listComicFiles(req.session.gdriveTokens, folderId);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gdrive/page - stream a page from Google Drive comic
router.get('/page', async (req, res) => {
  if (!req.session.gdriveTokens) return res.status(401).json({ error: 'Not authenticated' });

  const { fileId, page } = req.query;
  if (!fileId || page === undefined) return res.status(400).json({ error: 'fileId and page required' });

  try {
    const { buffer, mimeType } = await gdriveService.getPage(req.session.gdriveTokens, fileId, parseInt(page));
    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
