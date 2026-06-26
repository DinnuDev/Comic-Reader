'use strict';
/**
 * gdriveService.js
 *
 * Google Drive OAuth2 service with DB-persisted token storage.
 * Tokens survive server restarts and are auto-refreshed on expiry.
 */

const { google } = require('googleapis');
const path = require('path');
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');

const IMAGE_EXTENSIONS = new Set(['.jpg','.jpeg','.png','.gif','.webp','.avif','.bmp']);
const COMIC_EXTS = ['.cbz','.cbr','.pdf','.zip'];
const COMIC_MIME_TYPES = new Set([
  'application/zip','application/x-cbz','application/x-cbr',
  'application/pdf','application/vnd.comicbook+zip',
  'application/x-zip-compressed','application/octet-stream',
]);

// ── Credentials check ─────────────────────────────────────────────────────

function isConfigured() {
  const id     = process.env.GOOGLE_CLIENT_ID     || '';
  const secret = process.env.GOOGLE_CLIENT_SECRET || '';
  return id.length > 10     && !id.startsWith('your-') &&
         secret.length > 5  && !secret.startsWith('your-');
}

// ── OAuth2 client factory ─────────────────────────────────────────────────

function createOAuth2Client() {
  if (!isConfigured()) {
    throw new Error(
      'Google Drive credentials not configured. ' +
      'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env'
    );
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/gdrive/callback'
  );
}

function getAuthUrl(state = '') {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    state,
    scope: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  });
}

// ── Token exchange + persistence ──────────────────────────────────────────

async function exchangeCode(code) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error('No access token returned by Google');
  return tokens;
}

/** Save tokens + user info to DB. Returns the account row. */
async function saveAccount(tokens) {
  const userInfo = await getUserInfoRaw(tokens);
  const existing = db.prepare('SELECT id FROM gdrive_accounts WHERE email = ?').get(userInfo.email);
  const id = existing?.id ?? uuidv4();

  db.prepare(`
    INSERT INTO gdrive_accounts (id, email, name, picture, access_token, refresh_token, expiry_date, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      picture = excluded.picture,
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, gdrive_accounts.refresh_token),
      expiry_date = excluded.expiry_date,
      updated_at = unixepoch()
  `).run(
    id, userInfo.email, userInfo.name, userInfo.picture,
    tokens.access_token,
    tokens.refresh_token ?? null,
    tokens.expiry_date ?? null
  );

  return db.prepare('SELECT * FROM gdrive_accounts WHERE id = ?').get(id);
}

/** Load account from DB by id. Returns null if not found. */
function loadAccount(accountId) {
  return db.prepare('SELECT * FROM gdrive_accounts WHERE id = ?').get(accountId) ?? null;
}

/** List all connected accounts. */
function listAccounts() {
  return db.prepare('SELECT id, email, name, picture, updated_at FROM gdrive_accounts ORDER BY updated_at DESC').all();
}

/** Remove an account. */
function removeAccount(accountId) {
  db.prepare('DELETE FROM gdrive_accounts WHERE id = ?').run(accountId);
}

// ── Drive client with auto-refresh ───────────────────────────────────────

function getDriveClient(account) {
  const auth = createOAuth2Client();
  auth.setCredentials({
    access_token:  account.access_token,
    refresh_token: account.refresh_token,
    expiry_date:   account.expiry_date,
  });

  // Persist refreshed tokens back to DB
  auth.on('tokens', (newTokens) => {
    db.prepare(`
      UPDATE gdrive_accounts
      SET access_token = ?,
          refresh_token = COALESCE(?, refresh_token),
          expiry_date = ?,
          updated_at = unixepoch()
      WHERE id = ?
    `).run(
      newTokens.access_token,
      newTokens.refresh_token ?? null,
      newTokens.expiry_date ?? null,
      account.id
    );
  });

  return google.drive({ version: 'v3', auth });
}

// ── User info ─────────────────────────────────────────────────────────────

async function getUserInfoRaw(tokens) {
  const auth = createOAuth2Client();
  auth.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth });
  const res = await oauth2.userinfo.get();
  return res.data; // { email, name, picture, ... }
}

async function getAbout(account) {
  const drive = getDriveClient(account);
  const res = await drive.about.get({
    fields: 'user(displayName,emailAddress,photoLink),storageQuota',
  });
  return res.data;
}

// ── Folder & file listing ─────────────────────────────────────────────────

async function listFolders(account, parentId = 'root') {
  const drive = getDriveClient(account);
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'name',
    pageSize: 200,
  });
  return res.data.files || [];
}

async function listFolderContents(account, folderId = 'root') {
  const drive = getDriveClient(account);
  // Get folders and comic files in one request
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size, thumbnailLink, iconLink)',
    orderBy: 'folder,name',
    pageSize: 300,
  });

  const all = res.data.files || [];
  const folders = all.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const comics  = all.filter(f =>
    COMIC_MIME_TYPES.has(f.mimeType) ||
    COMIC_EXTS.some(ext => f.name.toLowerCase().endsWith(ext))
  );

  return { folders, comics };
}

async function getFolderInfo(account, folderId) {
  const drive = getDriveClient(account);
  const res = await drive.files.get({
    fileId: folderId,
    fields: 'id,name,parents',
  });
  return res.data;
}

async function listComicFiles(account, folderId = 'root') {
  const { comics } = await listFolderContents(account, folderId);
  return comics;
}

// ── Page streaming ────────────────────────────────────────────────────────

async function downloadFileBuffer(account, fileId) {
  const drive = getDriveClient(account);
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
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
  const stream = entries[pageNum].stream();
  for await (const chunk of stream) chunks.push(chunk);
  return { buffer: Buffer.concat(chunks), mimeType: 'image/jpeg' };
}

module.exports = {
  isConfigured,
  getAuthUrl,
  exchangeCode,
  saveAccount,
  loadAccount,
  listAccounts,
  removeAccount,
  getUserInfoRaw,
  getAbout,
  listFolders,
  listFolderContents,
  getFolderInfo,
  listComicFiles,
  getPage,
};
