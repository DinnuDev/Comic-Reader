'use strict';
/**
 * gdriveService.js — PKCE OAuth2 (no client secret required)
 *
 * Uses the PKCE (Proof Key for Code Exchange) extension so users only need
 * to supply a GOOGLE_CLIENT_ID (Desktop-app type). The client_secret field
 * is intentionally omitted — Google accepts PKCE-only token exchange for
 * public / installed-application OAuth clients.
 */

const crypto = require('crypto');
const https  = require('https');
const path   = require('path');
const db     = require('../db/database');
const { v4: uuidv4 } = require('uuid');

const IMAGE_EXTENSIONS = new Set(['.jpg','.jpeg','.png','.gif','.webp','.avif','.bmp']);
const COMIC_EXTS = ['.cbz','.cbr','.pdf','.zip'];
const COMIC_MIME_TYPES = new Set([
  'application/zip','application/x-cbz','application/x-cbr',
  'application/pdf','application/vnd.comicbook+zip',
  'application/x-zip-compressed','application/octet-stream',
]);

// ── Configuration check ───────────────────────────────────────────────────

function clientId() { return process.env.GOOGLE_CLIENT_ID || ''; }

function isConfigured() {
  const id = clientId();
  return id.length > 10 && id.includes('.apps.googleusercontent.com');
}

function getRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/gdrive/callback';
}

// ── PKCE helpers ──────────────────────────────────────────────────────────

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function generateState() {
  return crypto.randomBytes(16).toString('base64url');
}

// ── Auth URL ──────────────────────────────────────────────────────────────

function getAuthUrl(codeChallenge, state = '') {
  if (!isConfigured()) throw new Error('Google Client ID not configured');
  const params = new URLSearchParams({
    client_id:             clientId(),
    redirect_uri:          getRedirectUri(),
    response_type:         'code',
    scope:                 [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' '),
    access_type:           'offline',
    prompt:                'consent',
    state,
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ── Token exchange (PKCE — no client secret) ──────────────────────────────

async function exchangeCode(code, codeVerifier) {
  const body = new URLSearchParams({
    client_id:    clientId(),
    code,
    code_verifier: codeVerifier,
    grant_type:   'authorization_code',
    redirect_uri: getRedirectUri(),
  });

  const data = await postJSON('https://oauth2.googleapis.com/token', body.toString(),
    { 'Content-Type': 'application/x-www-form-urlencoded' });

  if (data.error) throw new Error(data.error_description || data.error);
  if (!data.access_token) throw new Error('No access token in response');

  // Normalise expiry to an absolute timestamp (ms) like googleapis does
  if (data.expires_in && !data.expiry_date) {
    data.expiry_date = Date.now() + data.expires_in * 1000;
  }
  return data;
}

// ── Token refresh ─────────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id:     clientId(),
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
  });

  const data = await postJSON('https://oauth2.googleapis.com/token', body.toString(),
    { 'Content-Type': 'application/x-www-form-urlencoded' });

  if (data.error) throw new Error(data.error_description || data.error);
  if (data.expires_in) data.expiry_date = Date.now() + data.expires_in * 1000;
  return data;
}

// ── Account persistence ───────────────────────────────────────────────────

async function saveAccount(tokens) {
  const userInfo = await getUserInfo(tokens.access_token);
  const existing = db.prepare('SELECT id FROM gdrive_accounts WHERE email = ?').get(userInfo.email);
  const id = existing?.id ?? uuidv4();

  db.prepare(`
    INSERT INTO gdrive_accounts (id, email, name, picture, access_token, refresh_token, expiry_date, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(email) DO UPDATE SET
      name          = excluded.name,
      picture       = excluded.picture,
      access_token  = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, gdrive_accounts.refresh_token),
      expiry_date   = excluded.expiry_date,
      updated_at    = unixepoch()
  `).run(id, userInfo.email, userInfo.name, userInfo.picture,
    tokens.access_token, tokens.refresh_token ?? null, tokens.expiry_date ?? null);

  return db.prepare('SELECT * FROM gdrive_accounts WHERE id = ?').get(id);
}

function loadAccount(id) {
  return db.prepare('SELECT * FROM gdrive_accounts WHERE id = ?').get(id) ?? null;
}

function listAccounts() {
  return db.prepare('SELECT id, email, name, picture, updated_at FROM gdrive_accounts ORDER BY updated_at DESC').all();
}

function removeAccount(id) {
  db.prepare('DELETE FROM gdrive_accounts WHERE id = ?').run(id);
}

// ── Fresh access token (auto-refresh) ────────────────────────────────────

async function getValidToken(account) {
  const EXPIRY_BUFFER = 5 * 60 * 1000; // refresh 5 min before expiry
  if (account.expiry_date && Date.now() + EXPIRY_BUFFER < account.expiry_date) {
    return account.access_token; // still valid
  }
  if (!account.refresh_token) throw new Error('No refresh token — please reconnect Google Drive');

  const refreshed = await refreshAccessToken(account.refresh_token);
  db.prepare(`
    UPDATE gdrive_accounts
    SET access_token = ?, expiry_date = ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(refreshed.access_token, refreshed.expiry_date ?? null, account.id);

  return refreshed.access_token;
}

// ── User info ─────────────────────────────────────────────────────────────

async function getUserInfo(accessToken) {
  const data = await getJSON(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    accessToken
  );
  return data; // { email, name, picture, ... }
}

async function getAbout(account) {
  const token = await getValidToken(account);
  const data = await getJSON(
    'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink),storageQuota',
    token
  );
  return data;
}

// ── Drive listing ─────────────────────────────────────────────────────────

async function listFolderContents(account, folderId = 'root') {
  const token = await getValidToken(account);
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent('files(id,name,mimeType,size,iconLink)');
  const data = await getJSON(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=folder,name&pageSize=300`,
    token
  );

  const all = data.files || [];
  const FOLDER_TYPE = 'application/vnd.google-apps.folder';
  const folders = all.filter(f => f.mimeType === FOLDER_TYPE);
  const comics  = all.filter(f =>
    f.mimeType !== FOLDER_TYPE && (
      COMIC_MIME_TYPES.has(f.mimeType) ||
      COMIC_EXTS.some(ext => f.name.toLowerCase().endsWith(ext))
    )
  );
  return { folders, comics };
}

async function listFolders(account, parentId = 'root') {
  const { folders } = await listFolderContents(account, parentId);
  return folders;
}

async function getFolderInfo(account, folderId) {
  const token = await getValidToken(account);
  return getJSON(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,parents`, token);
}

async function listComicFiles(account, folderId = 'root') {
  const { comics } = await listFolderContents(account, folderId);
  return comics;
}

// ── Page streaming ────────────────────────────────────────────────────────

async function downloadFileBuffer(account, fileId) {
  const token = await getValidToken(account);
  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
  });
}

async function getPage(account, fileId, pageNum) {
  const buffer = await downloadFileBuffer(account, fileId);
  const unzipper = require('unzipper');
  const directory = await unzipper.Open.buffer(buffer);
  const entries = directory.files
    .filter(f => IMAGE_EXTENSIONS.has(path.extname(f.path).toLowerCase()))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  if (pageNum >= entries.length) throw new Error('Page out of range');
  const chunks = [];
  for await (const chunk of entries[pageNum].stream()) chunks.push(chunk);
  return { buffer: Buffer.concat(chunks), mimeType: 'image/jpeg' };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────

function getJSON(url, accessToken) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const req = https.get({
      hostname: opts.hostname,
      path:     opts.pathname + opts.search,
      headers:  { Authorization: `Bearer ${accessToken}` },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

function postJSON(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const req = https.request({
      method:   'POST',
      hostname: opts.hostname,
      path:     opts.pathname,
      headers:  { ...headers, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  isConfigured,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  getAuthUrl,
  exchangeCode,
  saveAccount, loadAccount, listAccounts, removeAccount,
  getValidToken,
  getUserInfo, getAbout,
  listFolders, listFolderContents, getFolderInfo, listComicFiles,
  getPage,
};
