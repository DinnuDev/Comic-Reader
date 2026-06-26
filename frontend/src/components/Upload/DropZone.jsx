import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Typography, Progress } from 'antd';
import {
  InboxOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LoadingOutlined, FileOutlined, SyncOutlined,
} from '@ant-design/icons';
import { uploadApi } from '../../services/api';
import styles from './DropZone.module.css';

const { Text } = Typography;

const ALLOWED_EXTS = ['.cbz', '.cbr', '.zip', '.pdf'];
const MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
const LARGE_THRESHOLD = 200 * 1024 * 1024;  // 200 MB — show extra warning

function fmtSize(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function fmtSpeed(bytesPerSec) {
  if (bytesPerSec >= 1024 ** 2) return `${(bytesPerSec / 1024 ** 2).toFixed(1)} MB/s`;
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}

// ── Processing poller: polls /api/upload/status/:id until page_count > 0 ─
function useProcessingPoller(processingIds, onDone) {
  useEffect(() => {
    if (!processingIds.length) return;
    const interval = setInterval(async () => {
      const stillPending = [];
      for (const id of processingIds) {
        try {
          const status = await uploadApi.getStatus(id);
          if (!status.processing) {
            onDone(id, status.page_count);
          } else {
            stillPending.push(id);
          }
        } catch {
          stillPending.push(id);
        }
      }
      if (!stillPending.length) clearInterval(interval);
    }, 2500);
    return () => clearInterval(interval);
  }, [processingIds.join(',')]);
}

export default function DropZone({ onUploaded, compact = false }) {
  const [isDragging, setIsDragging] = useState(false);
  const [items, setItems] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [processingIds, setProcessingIds] = useState([]);
  const inputRef = useRef(null);
  const dragCounter = useRef(0);
  const startTimeRef = useRef(0);
  const abortRef = useRef(null);

  // Poll for large-file background processing
  useProcessingPoller(processingIds, (id, pageCount) => {
    setProcessingIds(prev => prev.filter(p => p !== id));
    setItems(prev => prev.map(it =>
      it.id === id ? { ...it, status: 'done', pageCount, processing: false } : it
    ));
  });

  const validate = (files) => {
    const valid = [], invalid = [];
    for (const f of files) {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTS.includes(ext)) {
        invalid.push(`"${f.name}" — unsupported type (${ext})`);
      } else if (f.size > MAX_BYTES) {
        invalid.push(`"${f.name}" — exceeds 5 GB limit (${fmtSize(f.size)})`);
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
        ...invalid.map(msg => ({ key: Date.now() + Math.random(), name: msg, status: 'error' })),
      ]);
    }
    if (!valid.length) return;

    const pending = valid.map(f => ({
      key: Date.now() + Math.random(),
      name: f.name,
      size: f.size,
      isLarge: f.size >= LARGE_THRESHOLD,
      status: 'pending',
      percent: 0,
      uploaded: 0,
      speed: 0,
      eta: null,
    }));

    setItems(prev => [...prev, ...pending]);
    setIsUploading(true);
    startTimeRef.current = Date.now();

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const result = await uploadApi.uploadFiles(valid, (progressEvent) => {
        const { loaded, total } = progressEvent;
        const percent = total ? Math.round((loaded / total) * 100) : 0;
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const speed = elapsed > 0.5 ? loaded / elapsed : 0;
        const remaining = speed > 0 && total ? (total - loaded) / speed : null;

        setItems(prev => prev.map(it =>
          pending.find(p => p.name === it.name)
            ? { ...it, status: 'uploading', percent, uploaded: loaded, speed, eta: remaining }
            : it
        ));
      }, controller.signal);

      // Mark results
      const newProcessingIds = [];
      setItems(prev => prev.map(it => {
        const res = result.results?.find(r => {
          const shortTitle = r.title.substring(0, 30);
          return it.name.includes(shortTitle) || it.name.startsWith(shortTitle);
        });
        const errMatch = result.errors?.find(e => e.file === it.name);

        if (res?.status === 'duplicate') return { ...it, status: 'duplicate', percent: 100 };
        if (res?.status === 'added') {
          if (res.processing) {
            newProcessingIds.push(res.id);
            return { ...it, id: res.id, status: 'processing', percent: 100, processing: true };
          }
          return { ...it, id: res.id, status: 'done', percent: 100 };
        }
        if (errMatch) return { ...it, status: 'error', error: errMatch.error };

        return { ...it, status: 'done', percent: 100 };
      }));

      if (newProcessingIds.length) {
        setProcessingIds(prev => [...prev, ...newProcessingIds]);
      }

      if (result.added > 0) onUploaded?.(result.added);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      setItems(prev => prev.map(it =>
        pending.find(p => p.name === it.name)
          ? { ...it, status: 'error', error: err.response?.data?.error || err.message }
          : it
      ));
    } finally {
      setIsUploading(false);
      abortRef.current = null;
    }
  }, [onUploaded]);

  // Drag handlers
  const onDragEnter = useCallback((e) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.items?.length) setIsDragging(true);
  }, []);
  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);
  const onDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const clearDone = () => setItems(prev => prev.filter(i => i.status !== 'done' && i.status !== 'duplicate'));

  const cancelUpload = () => {
    if (abortRef.current) abortRef.current.abort();
  };

  if (compact) {
    return (
      <div
        className={`${styles.compact} ${isDragging ? styles.dragOver : ''}`}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <InboxOutlined className={styles.compactIcon} />
        <span>Drop comics here or <u>click to browse</u></span>
        <span className={styles.compactHint}>CBZ · CBR · PDF · up to 5 GB</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".cbz,.cbr,.zip,.pdf"
          style={{ display: 'none' }}
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
        />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {/* Drop zone */}
      <div
        className={`${styles.zone} ${isDragging ? styles.dragOver : ''}`}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".cbz,.cbr,.zip,.pdf"
          style={{ display: 'none' }}
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
        />
        <InboxOutlined className={styles.zoneIcon} />
        <div className={styles.zoneTitle}>
          {isDragging ? 'Release to upload' : 'Drop comic files here'}
        </div>
        <div className={styles.zoneSub}>Click to browse · CBZ · CBR · PDF · ZIP</div>
        <div className={styles.zoneLimit}>Up to 5 GB per file</div>
      </div>

      {/* File list */}
      {items.length > 0 && (
        <div className={styles.list}>
          <div className={styles.listHeader}>
            <Text strong style={{ color: '#e5e5e5' }}>Files</Text>
            <div style={{ display: 'flex', gap: 8 }}>
              {isUploading && (
                <button className={styles.cancelBtn} onClick={cancelUpload}>Cancel</button>
              )}
              {items.some(i => i.status === 'done' || i.status === 'duplicate') && (
                <button className={styles.clearBtn} onClick={clearDone}>Clear done</button>
              )}
            </div>
          </div>

          {items.map((item, idx) => (
            <div key={item.key || idx} className={styles.item}>
              <FileOutlined className={styles.fileIcon} />
              <div className={styles.itemInfo}>
                <div className={styles.fileName}>{item.name}</div>

                {/* Size + speed + ETA row */}
                <div className={styles.fileMeta}>
                  {item.size && <span>{fmtSize(item.size)}</span>}
                  {item.isLarge && item.status === 'pending' && (
                    <span className={styles.largeWarning}>⚠ Large file — upload may take a moment</span>
                  )}
                  {item.status === 'uploading' && item.speed > 0 && (
                    <span className={styles.speed}>
                      {fmtSize(item.uploaded)} · {fmtSpeed(item.speed)}
                      {item.eta && ` · ${item.eta < 60 ? `${Math.round(item.eta)}s` : `${Math.round(item.eta / 60)}m`} left`}
                    </span>
                  )}
                  {item.status === 'processing' && (
                    <span className={styles.processing}>⚙ Indexing pages in background…</span>
                  )}
                  {item.status === 'duplicate' && (
                    <span className={styles.dupText}>Already in library</span>
                  )}
                  {item.error && <span className={styles.errText}>{item.error}</span>}
                </div>

                {/* Progress bar */}
                {(item.status === 'uploading' || item.status === 'pending') && (
                  <Progress
                    percent={item.percent}
                    size="small"
                    strokeColor="#e50914"
                    showInfo={false}
                    className={styles.progress}
                  />
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
  if (status === 'processing') return <SyncOutlined spin style={{ color: '#faad14', fontSize: 16 }} />;
  if (status === 'duplicate')  return <CheckCircleOutlined style={{ color: '#555', fontSize: 16 }} />;
  return null;
}
