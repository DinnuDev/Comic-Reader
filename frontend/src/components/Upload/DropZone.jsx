/**
 * DropZone — drag-and-drop / click-to-browse file uploader.
 *
 * Key behaviour:
 * - The instant a file is selected, a ghost card appears in the library
 *   via the Zustand uploadQueue (no waiting for the upload to finish).
 * - Upload progress (% + speed + ETA) updates the ghost card in real time.
 * - When the upload completes the card transitions to "Indexing…" while
 *   the backend counts pages and generates a cover in the background.
 * - When indexing finishes the ghost card is removed and the real library
 *   card takes its place (triggered by cache invalidation in the poller hook).
 */
import React, { useState, useRef, useCallback } from 'react';
import { Typography, Progress } from 'antd';
import {
  InboxOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LoadingOutlined, FileOutlined, SyncOutlined,
} from '@ant-design/icons';
import { uploadApi } from '../../services/api';
import { useAppStore } from '../../store';
import styles from './DropZone.module.css';

const { Text } = Typography;

const ALLOWED_EXTS = ['.cbz', '.cbr', '.zip', '.pdf'];
const MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

function fmtSize(b) {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

function fmtSpeed(bps) {
  if (bps >= 1024 ** 2) return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
  return `${(bps / 1024).toFixed(0)} KB/s`;
}

function titleFromFilename(name) {
  return name.replace(/\.[^.]+$/, '');
}

export default function DropZone({ onUploaded, compact = false }) {
  const { queueAddUpload, queueUpdateUpload, queueRemoveUpload } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);
  const [items, setItems] = useState([]);    // list view inside the drawer
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef(null);
  const dragCounter = useRef(0);
  const abortRef = useRef(null);
  const startTimeRef = useRef(0);

  const validate = (files) => {
    const valid = [], invalid = [];
    for (const f of files) {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTS.includes(ext)) {
        invalid.push(`"${f.name}" — unsupported type`);
      } else if (f.size > MAX_BYTES) {
        invalid.push(`"${f.name}" — exceeds 5 GB limit`);
      } else {
        valid.push(f);
      }
    }
    return { valid, invalid };
  };

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList);
    const { valid, invalid } = validate(files);

    if (invalid.length) {
      setItems(prev => [
        ...prev,
        ...invalid.map(msg => ({ key: `err-${Date.now()}`, name: msg, status: 'error' })),
      ]);
    }
    if (!valid.length) return;

    // ── Immediately push ghost cards into the library ──────────────────────
    const pendingMeta = valid.map(f => ({
      localId: `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: titleFromFilename(f.name),
      size: f.size,
      status: 'uploading',
      percent: 0,
      comicId: null,
    }));

    pendingMeta.forEach(m => queueAddUpload(m));

    // Drawer list items
    const drawerItems = valid.map((f, i) => ({
      key: pendingMeta[i].localId,
      localId: pendingMeta[i].localId,
      name: f.name,
      size: f.size,
      isLarge: f.size >= 200 * 1024 * 1024,
      status: 'pending',
      percent: 0,
      speed: 0,
      eta: null,
    }));

    setItems(prev => [...prev, ...drawerItems]);
    setIsUploading(true);
    startTimeRef.current = Date.now();

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const result = await uploadApi.uploadFiles(valid, (evt) => {
        const percent = evt.total ? Math.round((evt.loaded / evt.total) * 100) : 0;
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const speed = elapsed > 0.5 ? evt.loaded / elapsed : 0;
        const eta = speed > 0 && evt.total ? (evt.total - evt.loaded) / speed : null;

        // Update drawer list
        setItems(prev => prev.map(it =>
          drawerItems.find(d => d.localId === it.localId)
            ? { ...it, status: 'uploading', percent, speed, eta }
            : it
        ));

        // Update ghost cards — distribute % across all files (simple average)
        pendingMeta.forEach(m =>
          queueUpdateUpload(m.localId, { percent, status: 'uploading' })
        );
      }, controller.signal);

      // ── Upload finished — match results to pending items ──────────────────
      const newProcessingIds = [];
      setItems(prev => prev.map(it => {
        const r = result.results?.find(r => {
          const t = r.title?.substring(0, 25) ?? '';
          return it.name.includes(t) || it.name.startsWith(t);
        });
        const e = result.errors?.find(e => e.file === it.name);

        if (r?.status === 'duplicate') return { ...it, status: 'duplicate', percent: 100 };
        if (r?.status === 'added') {
          const localItem = pendingMeta.find((_, i) => valid[i]?.name === it.name);
          if (localItem) {
            if (r.processing) {
              // Still indexing in background
              queueUpdateUpload(localItem.localId, { status: 'indexing', comicId: r.id });
              newProcessingIds.push(r.id);
              return { ...it, status: 'indexing', percent: 100 };
            } else {
              // Fully processed (small file)
              queueUpdateUpload(localItem.localId, { status: 'done', comicId: r.id });
              setTimeout(() => queueRemoveUpload(localItem.localId), 1200);
              return { ...it, status: 'done', percent: 100 };
            }
          }
          return { ...it, status: 'done', percent: 100 };
        }
        if (e) {
          const localItem = pendingMeta.find((_, i) => valid[i]?.name === it.name);
          if (localItem) queueRemoveUpload(localItem.localId);
          return { ...it, status: 'error', error: e.error };
        }
        return { ...it, status: 'done', percent: 100 };
      }));

      if (result.added > 0) onUploaded?.(result.added);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        pendingMeta.forEach(m => queueRemoveUpload(m.localId));
        return;
      }
      const msg = err.response?.data?.error || err.message;
      setItems(prev => prev.map(it =>
        drawerItems.find(d => d.localId === it.localId)
          ? { ...it, status: 'error', error: msg }
          : it
      ));
      pendingMeta.forEach(m => queueRemoveUpload(m.localId));
    } finally {
      setIsUploading(false);
      abortRef.current = null;
    }
  }, [onUploaded, queueAddUpload, queueUpdateUpload, queueRemoveUpload]);

  // ── Drag handlers ──────────────────────────────────────────────────────
  const onDragEnter = useCallback((e) => {
    e.preventDefault(); dragCounter.current++;
    if (e.dataTransfer.items?.length) setIsDragging(true);
  }, []);
  const onDragLeave = useCallback((e) => {
    e.preventDefault(); dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);
  const onDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault(); dragCounter.current = 0; setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const clearDone = () =>
    setItems(prev => prev.filter(i => i.status !== 'done' && i.status !== 'duplicate'));

  if (compact) {
    return (
      <div
        className={`${styles.compact} ${isDragging ? styles.dragOver : ''}`}
        onDragEnter={onDragEnter} onDragLeave={onDragLeave}
        onDragOver={onDragOver} onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <InboxOutlined className={styles.compactIcon} />
        <span>Drop comics here or <u>click to browse</u></span>
        <span className={styles.compactHint}>CBZ · CBR · PDF · up to 5 GB</span>
        <input ref={inputRef} type="file" multiple accept=".cbz,.cbr,.zip,.pdf"
          style={{ display: 'none' }}
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div
        className={`${styles.zone} ${isDragging ? styles.dragOver : ''}`}
        onDragEnter={onDragEnter} onDragLeave={onDragLeave}
        onDragOver={onDragOver} onDrop={onDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" multiple accept=".cbz,.cbr,.zip,.pdf"
          style={{ display: 'none' }}
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
        <InboxOutlined className={styles.zoneIcon} />
        <div className={styles.zoneTitle}>{isDragging ? 'Release to upload' : 'Drop comic files here'}</div>
        <div className={styles.zoneSub}>Click to browse · CBZ · CBR · PDF · ZIP</div>
        <div className={styles.zoneLimit}>Up to 5 GB per file</div>
      </div>

      {items.length > 0 && (
        <div className={styles.list}>
          <div className={styles.listHeader}>
            <Text strong style={{ color: '#e5e5e5' }}>Files</Text>
            <div style={{ display: 'flex', gap: 8 }}>
              {isUploading && (
                <button className={styles.cancelBtn}
                  onClick={() => abortRef.current?.abort()}>Cancel</button>
              )}
              {items.some(i => i.status === 'done' || i.status === 'duplicate') && (
                <button className={styles.clearBtn} onClick={clearDone}>Clear done</button>
              )}
            </div>
          </div>
          {items.map((item) => (
            <div key={item.key} className={styles.item}>
              <FileOutlined className={styles.fileIcon} />
              <div className={styles.itemInfo}>
                <div className={styles.fileName}>{item.name}</div>
                <div className={styles.fileMeta}>
                  {item.size && <span>{fmtSize(item.size)}</span>}
                  {item.isLarge && item.status === 'pending' && (
                    <span className={styles.largeWarning}>⚠ Large file</span>
                  )}
                  {item.status === 'uploading' && item.speed > 0 && (
                    <span className={styles.speed}>
                      {fmtSize(item.size ? item.percent * item.size / 100 : 0)} ·{' '}
                      {fmtSpeed(item.speed)}
                      {item.eta && ` · ${item.eta < 60 ? `${Math.round(item.eta)}s` : `${Math.round(item.eta / 60)}m`} left`}
                    </span>
                  )}
                  {item.status === 'indexing' && (
                    <span className={styles.processing}>⚙ Indexing in background…</span>
                  )}
                  {item.status === 'duplicate' && <span className={styles.dupText}>Already in library</span>}
                  {item.error && <span className={styles.errText}>{item.error}</span>}
                </div>
                {(item.status === 'uploading' || item.status === 'pending') && (
                  <Progress percent={item.percent} size="small" strokeColor="#e50914"
                    showInfo={false} className={styles.progress} />
                )}
              </div>
              <StatusIcon status={item.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }) {
  if (status === 'done')       return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />;
  if (status === 'error')      return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />;
  if (status === 'uploading' || status === 'pending') return <LoadingOutlined style={{ color: '#e50914', fontSize: 16 }} />;
  if (status === 'indexing')   return <SyncOutlined spin style={{ color: '#faad14', fontSize: 16 }} />;
  if (status === 'duplicate')  return <CheckCircleOutlined style={{ color: '#555', fontSize: 16 }} />;
  return null;
}
