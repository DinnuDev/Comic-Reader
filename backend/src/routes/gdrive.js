'use strict';
const express = require('express');
const router = express.Router();
const svc = require('../services/gdriveService');
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Config & status ───────────────────────────────────────────────────────

// GET /api/gdrive/config-status
router.get('/config-status', (req, res) => {
  res.json({ configured: svc.isConfigured() });
});

// GET /api/gdrive/accounts — list all connected accounts (persisted in DB)
router.get('/accounts', (req, res) => {
  res.json(svc.listAccounts());
});

// GET /api/gdrive/status — legacy: first account + session fallback
router.get('/status', (req, res) => {
  const configured = svc.isConfigured();
  const accounts = svc.listAccounts();
  const connected = accounts.length > 0;
  res.json({
    configured,
    connected,
    accounts,
    // Legacy single-account fields
    user: accounts[0] ? { email: accounts[0].email, name: accounts[0].name, picture: accounts[0].picture } : null,
  });
});

// ── OAuth flow ────────────────────────────────────────────────────────────

// GET /api/gdrive/auth — returns auth URL to open in popup or redirect
router.get('/auth', (req, res) => {
  try {
    const url = svc.getAuthUrl();
    res.json({ url });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// GET /api/gdrive/callback — OAuth2 callback from Google
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return sendPopupResult(res, FRONTEND, 'error', error);
  }
  if (!code) {
    return sendPopupResult(res, FRONTEND, 'error', 'no_code');
  }

  try {
    const tokens = await svc.exchangeCode(code);
    const account = await svc.saveAccount(tokens);

    // Also keep in session for legacy page-reading endpoints
    req.session.gdriveTokens = {
      access_token:  account.access_token,
      refresh_token: account.refresh_token,
      expiry_date:   account.expiry_date,
    };
    req.session.gdriveUser = { email: account.email, name: account.name, picture: account.picture };
    req.session.gdriveAccountId = account.id;

    req.session.save(() => {
      sendPopupResult(res, FRONTEND, 'connected', account.id);
    });
  } catch (err) {
    console.error('[gdrive] callback error:', err.message);
    const reason = err.message.includes('invalid_grant') ? 'invalid_grant' : encodeURIComponent(err.message);
    sendPopupResult(res, FRONTEND, 'error', reason);
  }
});

/**
 * Sends an HTML page that:
 *  1. If the window is a popup → sends postMessage to opener and closes
 *  2. Otherwise → redirects the main window to the frontend
 */
function sendPopupResult(res, frontendUrl, status, payload) {
  const encodedPayload = encodeURIComponent(payload || '');
  res.send(`<!DOCTYPE html>
<html>
<head><title>Google Drive Auth</title></head>
<body>
<script>
  var status = ${JSON.stringify(status)};
  var payload = ${JSON.stringify(payload || '')};
  if (window.opener) {
    window.opener.postMessage({ type: 'gdrive-' + status, payload: payload }, '*');
    window.close();
  } else {
    // Not a popup: redirect main window
    var url = ${JSON.stringify(frontendUrl)} + '?gdrive=' + status;
    if (status === 'error') url += '&reason=' + encodeURIComponent(payload);
    window.location.href = url;
  }
</script>
<p>Completing authentication…</p>
</body>
</html>`);
}

// POST /api/gdrive/disconnect/:accountId
router.post('/disconnect/:accountId', (req, res) => {
  svc.removeAccount(req.params.accountId);
  // Clear session too
  if (req.session.gdriveAccountId === req.params.accountId) {
    delete req.session.gdriveTokens;
    delete req.session.gdriveUser;
    delete req.session.gdriveAccountId;
  }
  res.json({ success: true });
});

// POST /api/gdrive/disconnect (disconnect all / legacy)
router.post('/disconnect', (req, res) => {
  delete req.session.gdriveTokens;
  delete req.session.gdriveUser;
  delete req.session.gdriveAccountId;
  res.json({ success: true });
});

// ── Helper: resolve account from request ─────────────────────────────────

function resolveAccount(req) {
  const accountId = req.query.accountId || req.session?.gdriveAccountId;
  if (accountId) {
    const account = svc.loadAccount(accountId);
    if (account) return account;
  }
  // Fallback: first account in DB
  const all = svc.listAccounts();
  if (all.length > 0) return svc.loadAccount(all[0].id);
  return null;
}

function requireAccount(req, res) {
  const account = resolveAccount(req);
  if (!account) {
    res.status(401).json({ error: 'No Google Drive account connected. Please authenticate first.' });
    return null;
  }
  return account;
}

// ── Account info & quota ──────────────────────────────────────────────────

// GET /api/gdrive/about?accountId=...
router.get('/about', async (req, res) => {
  const account = requireAccount(req, res);
  if (!account) return;
  try {
    const about = await svc.getAbout(account);
    res.json({ ...about, account: { id: account.id, email: account.email, picture: account.picture } });
  } catch (err) {
    handleDriveError(err, req, res);
  }
});

// ── Folder browsing ───────────────────────────────────────────────────────

// GET /api/gdrive/browse?folderId=root&accountId=...
// Returns both subfolders and comic files in a folder
router.get('/browse', async (req, res) => {
  const account = requireAccount(req, res);
  if (!account) return;
  const { folderId = 'root' } = req.query;
  try {
    const [contents, folderInfo] = await Promise.all([
      svc.listFolderContents(account, folderId),
      folderId !== 'root' ? svc.getFolderInfo(account, folderId).catch(() => null) : null,
    ]);
    res.json({ ...contents, folderInfo, folderId });
  } catch (err) {
    handleDriveError(err, req, res);
  }
});

// GET /api/gdrive/folders?parent=root&accountId=...
router.get('/folders', async (req, res) => {
  const account = requireAccount(req, res);
  if (!account) return;
  const { parent = 'root' } = req.query;
  try {
    const folders = await svc.listFolders(account, parent);
    res.json(folders);
  } catch (err) {
    handleDriveError(err, req, res);
  }
});

// GET /api/gdrive/files?folderId=root&accountId=...
router.get('/files', async (req, res) => {
  const account = requireAccount(req, res);
  if (!account) return;
  const { folderId = 'root' } = req.query;
  try {
    const files = await svc.listComicFiles(account, folderId);
    res.json(files);
  } catch (err) {
    handleDriveError(err, req, res);
  }
});

// ── Page streaming ────────────────────────────────────────────────────────

// GET /api/gdrive/page?fileId=...&page=0&accountId=...
router.get('/page', async (req, res) => {
  const account = requireAccount(req, res);
  if (!account) return;
  const { fileId, page } = req.query;
  if (!fileId || page === undefined) return res.status(400).json({ error: 'fileId and page required' });
  try {
    const { buffer, mimeType } = await svc.getPage(account, fileId, parseInt(page));
    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Error helper ──────────────────────────────────────────────────────────

function handleDriveError(err, req, res) {
  const status = err.code || err.status;
  if (status === 401 || status === 403) {
    return res.status(401).json({ error: 'Google Drive session expired. Please reconnect.', expired: true });
  }
  console.error('[gdrive]', err.message);
  res.status(500).json({ error: err.message });
}

module.exports = router;
