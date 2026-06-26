const { google } = require('googleapis');
const AdmZip = require('adm-zip');
const path = require('path');

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp'];
const COMIC_MIME_TYPES = [
  'application/zip',
  'application/x-cbz',
  'application/x-cbr',
  'application/pdf',
  'application/vnd.comicbook+zip',
  'application/x-zip-compressed',
  'application/octet-stream', // many drives store CBZ as octet-stream
];

function isConfigured() {
  const id = process.env.GOOGLE_CLIENT_ID || '';
  const secret = process.env.GOOGLE_CLIENT_SECRET || '';
  return id.length > 10 && !id.startsWith('your-') &&
         secret.length > 5 && !secret.startsWith('your-');
}

function createOAuth2Client() {
  if (!isConfigured()) {
    throw new Error('Google Drive credentials are not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env');
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/gdrive/callback'
  );
}

function getAuthUrl() {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'consent',
  });
}

async function exchangeCode(code) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error('No access token received from Google');
  return tokens;
}

/** Get a Drive client with automatic token refresh. */
function getDriveClient(tokens) {
  const auth = createOAuth2Client();
  auth.setCredentials(tokens);
  // Auto-refresh access token when it expires
  auth.on('tokens', (newTokens) => {
    if (newTokens.refresh_token) tokens.refresh_token = newTokens.refresh_token;
    tokens.access_token = newTokens.access_token;
    tokens.expiry_date = newTokens.expiry_date;
  });
  return google.drive({ version: 'v3', auth });
}

/** Get userinfo to verify authentication is working. */
async function getUserInfo(tokens) {
  const auth = createOAuth2Client();
  auth.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth });
  const res = await oauth2.userinfo.get();
  return res.data;
}

async function listFolders(tokens, parentId = 'root') {
  const drive = getDriveClient(tokens);
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'name',
    pageSize: 100,
  });
  return res.data.files;
}

async function listComicFiles(tokens, folderId = 'root') {
  const drive = getDriveClient(tokens);
  // Broad query: include common types + all files by extension pattern
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size, thumbnailLink)',
    orderBy: 'name',
    pageSize: 200,
  });
  // Filter client-side by name extension (Drive often misclassifies CBZ as octet-stream)
  const COMIC_EXTS = ['.cbz', '.cbr', '.pdf', '.zip'];
  return (res.data.files || []).filter(f =>
    COMIC_MIME_TYPES.includes(f.mimeType) ||
    COMIC_EXTS.some(ext => f.name.toLowerCase().endsWith(ext))
  );
}

async function downloadFile(tokens, fileId) {
  const drive = getDriveClient(tokens);
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
}

async function getPage(tokens, fileId, pageNum) {
  // Download the file and extract page
  const buffer = await downloadFile(tokens, fileId);

  // Try as ZIP/CBZ
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries()
      .filter(e => IMAGE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()))
      .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
    if (pageNum >= entries.length) throw new Error('Page out of range');
    const entry = entries[pageNum];
    return { buffer: entry.getData(), mimeType: 'image/jpeg' };
  } catch (e) {
    throw new Error('Could not extract page from Google Drive file');
  }
}

module.exports = { isConfigured, getAuthUrl, exchangeCode, getUserInfo, listFolders, listComicFiles, getPage };
