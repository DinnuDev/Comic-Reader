const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const Jimp = require('jimp');
const mime = require('mime-types');
const { glob } = require('glob');
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp'];
const COMIC_EXTENSIONS = ['.cbz', '.cbr', '.zip', '.pdf'];

/**
 * Scan a source directory for comics and add them to the DB.
 */
async function scanSource(source) {
  if (source.type !== 'local') throw new Error('Only local sources supported in comicService.scanSource');

  const basePath = path.resolve(source.path);
  const patterns = [...COMIC_EXTENSIONS.map(ext => `**/*${ext}`), '*/'];

  // Find comic files
  const files = await glob(`**/*.{cbz,cbr,zip,pdf}`, { cwd: basePath, absolute: true, nocase: true });

  // Also find directories that contain images (treat as comics)
  const dirs = await glob(`*/`, { cwd: basePath, absolute: true });
  const imageDirs = [];
  for (const dir of dirs) {
    const contents = fs.readdirSync(dir);
    const hasImages = contents.some(f => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()));
    if (hasImages) imageDirs.push(dir.replace(/\/$/, ''));
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
    const pageCount = isDir ? countImagesInDir(filePath) : await countPages(filePath, ext);

    db.prepare(`
      INSERT INTO comics (id, source_id, title, file_path, file_type, file_size, page_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, source.id, title, filePath, ext, isDir ? 0 : stat.size, pageCount);

    // Generate cover asynchronously
    generateCoverAsync(id, filePath, ext);

    added++;
  }

  return added;
}

function countImagesInDir(dirPath) {
  try {
    return fs.readdirSync(dirPath)
      .filter(f => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase())).length;
  } catch { return 0; }
}

async function countPages(filePath, ext) {
  try {
    if (ext === 'cbz' || ext === 'zip') {
      const zip = new AdmZip(filePath);
      return zip.getEntries().filter(e => IMAGE_EXTENSIONS.includes(path.extname(e.name).toLowerCase())).length;
    }
    if (ext === 'pdf') {
      // Quick page count from PDF
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fs.readFileSync(filePath));
      return data.numpages;
    }
    return 0;
  } catch { return 0; }
}

async function generateCoverAsync(comicId, filePath, ext) {
  try {
    const { buffer } = await getPage({ id: comicId, file_path: filePath, file_type: ext }, 0);
    const coversDir = path.resolve(__dirname, '../../data/covers');
    if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });

    const coverPath = path.join(coversDir, `${comicId}.jpg`);
    const img = await Jimp.read(buffer);
    img.cover(300, 450).quality(85).write(coverPath);
    db.prepare('UPDATE comics SET cover_path = ? WHERE id = ?').run(`/covers/${comicId}.jpg`, comicId);
  } catch (e) {
    // Cover generation is optional
  }
}

/**
 * Get ordered list of page info for a comic.
 */
async function getPageList(comic) {
  const { file_path, file_type } = comic;

  if (file_type === 'folder') {
    const files = fs.readdirSync(file_path)
      .filter(f => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .sort();
    return files.map((f, i) => ({ index: i, name: f }));
  }

  if (file_type === 'cbz' || file_type === 'zip') {
    const zip = new AdmZip(file_path);
    const entries = zip.getEntries()
      .filter(e => IMAGE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()))
      .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
    return entries.map((e, i) => ({ index: i, name: e.name }));
  }

  if (file_type === 'pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fs.readFileSync(file_path));
    return Array.from({ length: data.numpages }, (_, i) => ({ index: i, name: `Page ${i + 1}` }));
  }

  return [];
}

/**
 * Get a specific page image as buffer.
 */
async function getPage(comic, pageNum) {
  const { file_path, file_type } = comic;

  if (file_type === 'folder') {
    const files = fs.readdirSync(file_path)
      .filter(f => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .sort();
    if (pageNum >= files.length) throw new Error('Page out of range');
    const imgPath = path.join(file_path, files[pageNum]);
    return { buffer: fs.readFileSync(imgPath), mimeType: mime.lookup(imgPath) || 'image/jpeg' };
  }

  if (file_type === 'cbz' || file_type === 'zip') {
    const zip = new AdmZip(file_path);
    const entries = zip.getEntries()
      .filter(e => IMAGE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()))
      .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
    if (pageNum >= entries.length) throw new Error('Page out of range');
    const entry = entries[pageNum];
    const buffer = entry.getData();
    return { buffer, mimeType: mime.lookup(entry.name) || 'image/jpeg' };
  }

  if (file_type === 'pdf') {
    // Render PDF page via pdf-poppler or use a fallback
    // Using pdf-parse for text extraction; for images we use pdf2pic pattern
    throw new Error('PDF rendering requires additional setup. Use pdf2pic or similar.');
  }

  throw new Error(`Unsupported file type: ${file_type}`);
}

/**
 * Get cover image (first page, resized).
 */
async function getCover(comic) {
  // If we have a cached cover, return it
  if (comic.cover_path) {
    const absPath = path.resolve(__dirname, '../../data', comic.cover_path.replace(/^\//, ''));
    if (fs.existsSync(absPath)) {
      return { buffer: fs.readFileSync(absPath), mimeType: 'image/jpeg' };
    }
  }
  // Generate on the fly
  const { buffer, mimeType } = await getPage(comic, 0);
  const img = await Jimp.read(buffer);
  const resized = await img.cover(300, 450).quality(85).getBufferAsync(Jimp.MIME_JPEG);
  return { buffer: resized, mimeType: 'image/jpeg' };
}

module.exports = { scanSource, getPageList, getPage, getCover, generateCoverAsync, countPagesPublic: countPages };
