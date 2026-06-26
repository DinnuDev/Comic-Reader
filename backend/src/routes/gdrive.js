'use strict';
const express = require('express');
const router = express.Router();
const svc = require('../services/gdriveService');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Config & accounts ─────────────────────────────────────────────────────

router.get('/config-status', (req, res) => {
  res.json({ configured: svc.isConfigured() });
});

router.get('/accounts', (req, res) => {
  res.json(svc.listAccounts());
});

router.get('/status', (req, res) => {
  const configured = svc.isConfigured();
  const accounts   = svc.listAccounts();
  res.json({
    configured,
    connected: accounts.length > 0,
    accounts,
    user: accounts[0] ?? null,
  });
});

// ── OAuth auth URL (PKCE) ─────────────────────────────────────────────────

router.get('/auth', (req, res) => {
  try {
    const verifier   = svc.generateCodeVerifier();
    const challenge  = svc.generateCodeChallenge(verifier);
    const state      = svc.generateState();

    // Store verifier in session — retrieved in callback
    req.session.gdriveOAuth = { verifier, state };
    req.session.save();

    const url = svc.getAuthUrl(challenge, state);
    res.json({ url });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// ── OAuth callback ────────────────────────────────────────────────────────

router.get('/callback', async (req, res) => {
  const { code, error, state } = req.query;

  if (error) return popupResult(res, FRONTEND, 'error', error);
  if (!code)  return popupResult(res, FRONTEND, 'error', 'no_code');

  const storedOAuth = req.session?.gdriveOAuth;
  if (!storedOAuth?.verifier) {
    return popupResult(res, FRONTEND, 'error', 'session_expired');
  }
  if (state && storedOAuth.state && state !== storedOAuth.state) {
    return popupResult(res, FRONTEND, 'error', 'state_mismatch');
  }

  try {
    const tokens  = await svc.exchangeCode(code, storedOAuth.verifier);
    const account = await svc.saveAccount(tokens);

    // Store account id in session for convenience
    req.session.gdriveAccountId = account.id;
    delete req.session.gdriveOAuth;
    req.session.save(() => popupResult(res, FRONTEND, 'connected', account.id));
  } catch (err) {
    console.error('[gdrive callback]', err.message);
    const reason = err.message.includes('invalid_grant') ? 'invalid_grant'
                 : encodeURIComponent(err.message);
    popupResult(res, FRONTEND, 'error', reason);
  }
});

// ── Disconnect ────────────────────────────────────────────────────────────

router.post('/disconnect/:accountId', (req, res) => {
  svc.removeAccount(req.params.accountId);
  if (req.session.gdriveAccountId === req.params.accountId) {
    delete req.session.gdriveAccountId;
  }
  res.json({ success: true });
});

router.post('/disconnect', (req, res) => {
  delete req.session.gdriveAccountId;
  res.json({ success: true });
});

// ── Drive APIs ────────────────────────────────────────────────────────────

function resolveAccount(req) {
  const id = req.query.accountId || req.session?.gdriveAccountId;
  if (id) {
    const a = svc.loadAccount(id);
    if (a) return a;
  }
  const all = svc.listAccounts();
  return all.length > 0 ? svc.loadAccount(all[0].id) : null;
}

function requireAccount(req, res) {
  const a = resolveAccount(req);
  if (!a) res.status(401).json({ error: 'No Google Drive account. Please connect first.' });
  return a;
}

router.get('/about', async (req, res) => {
  const account = requireAccount(req, res);
  if (!account) return;
  try {
    const about = await svc.getAbout(account);
    res.json({ ...about, account: { id: account.id, email: account.email, picture: account.picture, name: account.name } });
  } catch (err) { driveError(err, res); }
});

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
  } catch (err) { driveError(err, res); }
});

router.get('/folders', async (req, res) => {
  const account = requireAccount(req, res);
  if (!account) return;
  try {
    res.json(await svc.listFolders(account, req.query.parent || 'root'));
  } catch (err) { driveError(err, res); }
});

router.get('/files', async (req, res) => {
  const account = requireAccount(req, res);
  if (!account) return;
  try {
    res.json(await svc.listComicFiles(account, req.query.folderId || 'root'));
  } catch (err) { driveError(err, res); }
});

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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Helpers ───────────────────────────────────────────────────────────────

function driveError(err, res) {
  const s = err.code || err.status;
  if (s === 401 || s === 403) return res.status(401).json({ error: 'Session expired. Reconnect Google Drive.', expired: true });
  console.error('[gdrive]', err.message);
  res.status(500).json({ error: err.message });
}

function popupResult(res, frontendUrl, status, payload) {
  res.send(`<!DOCTYPE html><html><head><title>Google Drive Auth</title></head><body>
<script>
var s=${JSON.stringify(status)}, p=${JSON.stringify(payload||'')};
if(window.opener){window.opener.postMessage({type:'gdrive-'+s,payload:p},'*');window.close();}
else{var u=${JSON.stringify(frontendUrl)}+'?gdrive='+s;if(s==='error')u+='&reason='+encodeURIComponent(p);window.location.href=u;}
</script><p>Completing authentication…</p></body></html>`);
}

module.exports = router;
