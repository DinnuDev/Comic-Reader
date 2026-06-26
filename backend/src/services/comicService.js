/**
 * comicService.js
 *
 * All ZIP/CBZ operations use `unzipper` (streaming, random-access).
 * It reads the ZIP central directory from the end of the file, then
 * seeks directly to individual entries — so a 5 GB CBZ never loads
 * more than one page's worth of compressed data into memory at a time.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const Jimp = require('jimp');
const mime = require('mime-types');
const { glob } = require('glob');
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp']);
const COMIC_EXTS = ['.cbz', '.cbr', '.zip', '.pdf'];

// ── ZIP helpers (streaming, memory-efficient) ─────────────────────────────

/**
 * Open a ZIP file and return its sorted list of image entries.
 * unzipper reads only the central directory — no full-file scan for large ZIPs.
 */
async function openZipImages(filePath) {
  const directory = await unzipper.Open.file(filePath);
  return directory.files
    .filter(f => !f.type || f.type === 'File')
    .filter(f => IMAGE_EXTS.has(path.extname(f.path).toLowerCase()))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
}

/**
 * Extract a single entry from a ZIP as a Buffer.
 * Only the compressed bytes of that one entry are read from disk.
 */
async function extractZipEntry(entry) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = entry.stream();
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// ── Page counting ─────────────────────────────────────────────────────────

function countImagesInDir(dirPath) {
  try {
    return fs.readdirSync(dirPath)
      .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase())).length;
  } catch { return 0; }
}

async function countPages(filePath, ext) {
  try {
    if (ext === 'cbz' || ext === 'zip') {
      // Opens central directory only — fast even for 5 GB files
      const entries = await openZipImages(filePath);
      return entries.length;
    }
    if (ext === 'pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fs.readFileSync(filePath));
      return data.numpages;
    }
    return 0;
  } catch { return 0; }
}

// ── Source scanning ───────────────────────────────────────────────────────

async function scanSource(source) {
  if (source.type !== 'local') throw new Error('Only local sources supported');

  const basePath = path.resolve(source.path);
  const files = await glob('**/*.{cbz,cbr,zip,pdf}', { cwd: basePath, absolute: true, nocase: true });

  const dirs = await glob('*/', { cwd: basePath, absolute: true });
  const imageDirs = [];
  for (const dir of dirs) {
    const contents = fs.readdirSync(dir);
    if (contents.some(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))) {
      imageDirs.push(dir.replace(/\/$/, ''));
    }
  }

  const allComics = [...files, ...imageDirs];
  let added = 0;

  for (const filePath of allComics) {
    const existing = db.prepare('SELECT id FROM comics WHERE file_path = ?').get(filePath);
    if (existing) continue;

    const stat = fs.statSync(filePath);
    const isDir = stat.isDirectory();
    const ext = isDir ? 'folder' : path.extname(filePath).toLowerCase().replace('.', '');
    const title = path.basename(filePath, path.extname(filePath));
    const id = uuidv4();

    // For very large files, register immediately with page_count = 0
    // then count + generate cover in the background
    const isLarge = stat.size > 200 * 1024 * 1024; // > 200 MB = large
    const pageCount = isLarge ? 0 : (isDir ? countImagesInDir(filePath) : await countPages(filePath, ext));

    db.prepare(`
      INSERT INTO comics (id, source_id, title, file_path, file_type, file_size, page_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, source.id, title, filePath, ext, isDir ? 0 : stat.size, pageCount);

    generateCoverAsync(id, filePath, ext);
    if (isLarge) updatePageCountAsync(id, filePath, ext);

    added++;
  }

  return added;
}

/** Update page_count in background for large files */
async function updatePageCountAsync(comicId, filePath, ext) {
  try {
    const count = await countPages(filePath, ext);
    db.prepare('UPDATE comics SET page_count = ? WHERE id = ?').run(count, comicId);
  } catch {}
}

// ── Cover generation ──────────────────────────────────────────────────────

async function generateCoverAsync(comicId, filePath, ext) {
  try {
    const { buffer } = await getPage({ id: comicId, file_path: filePath, file_type: ext }, 0);
    const coversDir = path.resolve(__dirname, '../../data/covers');
    if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });

    const coverPath = path.join(coversDir, `${comicId}.jpg`);
    const img = await Jimp.read(buffer);
    await img.cover(300, 450).quality(85).writeAsync(coverPath);
    db.prepare('UPDATE comics SET cover_path = ? WHERE id = ?').run(`/covers/${comicId}.jpg`, comicId);
  } catch {
    // Cover generation is optional, fail silently
  }
}

// ── Page list ─────────────────────────────────────────────────────────────

async function getPageList(comic) {
  const { file_path, file_type } = comic;

  if (file_type === 'folder') {
    const files = fs.readdirSync(file_path)
      .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort();
    return files.map((f, i) => ({ index: i, name: f }));
  }

  if (file_type === 'cbz' || file_type === 'zip') {
    const entries = await openZipImages(file_path);
    return entries.map((e, i) => ({ index: i, name: path.basename(e.path) }));
  }

  if (file_type === 'pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fs.readFileSync(file_path));
    return Array.from({ length: data.numpages }, (_, i) => ({ index: i, name: `Page ${i + 1}` }));
  }

  return [];
}

// ── Single page extraction ────────────────────────────────────────────────

async function getPage(comic, pageNum) {
  const { file_path, file_type } = comic;

  if (file_type === 'folder') {
    const files = fs.readdirSync(file_path)
      .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort();
    if (pageNum >= files.length) throw new Error(`Page ${pageNum} out of range (${files.length} pages)`);
    const imgPath = path.join(file_path, files[pageNum]);
    return { buffer: fs.readFileSync(imgPath), mimeType: mime.lookup(imgPath) || 'image/jpeg' };
  }

  if (file_type === 'cbz' || file_type === 'zip') {
    // Random-access: reads central directory then seeks to the specific entry.
    // Only the compressed bytes for this one page are loaded into memory.
    const entries = await openZipImages(file_path);
    if (pageNum >= entries.length) throw new Error(`Page ${pageNum} out of range (${entries.length} pages)`);
    const entry = entries[pageNum];
    const buffer = await extractZipEntry(entry);
    return { buffer, mimeType: mime.lookup(entry.path) || 'image/jpeg' };
  }

  if (file_type === 'pdf') {
    throw new Error('PDF page rendering requires pdf2pic. Install it separately.');
  }

  throw new Error(`Unsupported file type: ${file_type}`);
}

// ── Cover (first page, resized) ───────────────────────────────────────────

async function getCover(comic) {
  if (comic.cover_path) {
    const absPath = path.resolve(__dirname, '../../data', comic.cover_path.replace(/^\//, ''));
    if (fs.existsSync(absPath)) {
      return { buffer: fs.readFileSync(absPath), mimeType: 'image/jpeg' };
    }
  }
  const { buffer } = await getPage(comic, 0);
  const img = await Jimp.read(buffer);
  const resized = await img.cover(300, 450).quality(85).getBufferAsync(Jimp.MIME_JPEG);
  return { buffer: resized, mimeType: 'image/jpeg' };
}

module.exports = {
  scanSource,
  getPageList,
  getPage,
  getCover,
  generateCoverAsync,
  countPagesPublic: countPages,
  updatePageCountAsync,
};
