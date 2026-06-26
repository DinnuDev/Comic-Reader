import React, { useState, useRef, useCallback } from 'react';
import { Upload, Typography, Progress, Button, Space, List, Tag } from 'antd';
import {
  InboxOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LoadingOutlined, FileOutlined,
} from '@ant-design/icons';
import { uploadApi } from '../../services/api';
import styles from './DropZone.module.css';

const { Text, Title } = Typography;
const ALLOWED_EXTS = ['.cbz', '.cbr', '.zip', '.pdf'];
const MAX_MB = 500;

export default function DropZone({ onUploaded, compact = false }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadItems, setUploadItems] = useState([]); // { name, status, percent, error }
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef(null);
  const dragCounter = useRef(0);

  const validateFiles = (files) => {
    const valid = [];
    const invalid = [];
    for (const f of files) {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTS.includes(ext)) {
        invalid.push(`"${f.name}" — unsupported type`);
      } else if (f.size > MAX_MB * 1024 * 1024) {
        invalid.push(`"${f.name}" — exceeds ${MAX_MB}MB`);
      } else {
        valid.push(f);
      }
    }
    return { valid, invalid };
  };

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList);
    const { valid, invalid } = validateFiles(files);

    if (invalid.length) {
      setUploadItems(prev => [
        ...prev,
        ...invalid.map(msg => ({ name: msg, status: 'error', percent: 0 })),
      ]);
    }

    if (valid.length === 0) return;

    // Add pending items
    const pending = valid.map(f => ({ name: f.name, status: 'pending', percent: 0, size: f.size }));
    setUploadItems(prev => [...prev, ...pending]);
    setIsUploading(true);

    try {
      const result = await uploadApi.uploadFiles(valid, (progressEvent) => {
        const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
        setUploadItems(prev =>
          prev.map(item =>
            pending.find(p => p.name === item.name)
              ? { ...item, status: 'uploading', percent }
              : item
          )
        );
      });

      // Update status for each result
      setUploadItems(prev =>
        prev.map(item => {
          const res = result.results?.find(r => item.name.includes(r.title.substring(0, 20)));
          if (res) return { ...item, status: res.status === 'added' ? 'done' : 'duplicate', percent: 100 };
          const err = result.errors?.find(e => e.file === item.name);
          if (err) return { ...item, status: 'error', error: err.error, percent: 0 };
          return { ...item, status: 'done', percent: 100 };
        })
      );

      if (result.added > 0) onUploaded?.(result.added);
    } catch (err) {
      setUploadItems(prev =>
        prev.map(item =>
          pending.find(p => p.name === item.name)
            ? { ...item, status: 'error', error: err.response?.data?.error || err.message }
            : item
        )
      );
    } finally {
      setIsUploading(false);
    }
  }, [onUploaded]);

  // Drag & drop handlers
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

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const clearDone = () => {
    setUploadItems(prev => prev.filter(i => i.status !== 'done' && i.status !== 'duplicate'));
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  };

  if (compact) {
    // Compact version: just a small drop target bar
    return (
      <div
        className={`${styles.compactZone} ${isDragging ? styles.dragOver : ''}`}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <InboxOutlined className={styles.compactIcon} />
        <span>Drop comics here or <u>click to upload</u></span>
        <span className={styles.hint}>CBZ · CBR · PDF · ZIP</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".cbz,.cbr,.zip,.pdf"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
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
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".cbz,.cbr,.zip,.pdf"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
        <InboxOutlined className={styles.icon} />
        <Title level={5} className={styles.title}>
          {isDragging ? 'Release to upload' : 'Drop comic files here'}
        </Title>
        <Text className={styles.subtitle}>
          Click to browse · CBZ · CBR · PDF · ZIP · Up to {MAX_MB}MB each
        </Text>
      </div>

      {/* Upload list */}
      {uploadItems.length > 0 && (
        <div className={styles.list}>
          <div className={styles.listHeader}>
            <Text strong>Uploads</Text>
            {uploadItems.some(i => i.status === 'done' || i.status === 'duplicate') && (
              <Button type="link" size="small" onClick={clearDone}>Clear done</Button>
            )}
          </div>
          {uploadItems.map((item, idx) => (
            <div key={idx} className={styles.item}>
              <FileOutlined className={styles.fileIcon} />
              <div className={styles.itemInfo}>
                <Text className={styles.fileName} ellipsis>{item.name}</Text>
                {item.size && <Text type="secondary" className={styles.fileSize}>{formatSize(item.size)}</Text>}
                {(item.status === 'uploading' || item.status === 'pending') && (
                  <Progress percent={item.percent} size="small" strokeColor="#e94560" showInfo={false} />
                )}
                {item.error && <Text type="danger" className={styles.error}>{item.error}</Text>}
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
  if (status === 'done') return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />;
  if (status === 'error') return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />;
  if (status === 'uploading' || status === 'pending') return <LoadingOutlined style={{ color: '#e94560', fontSize: 16 }} />;
  if (status === 'duplicate') return <CheckCircleOutlined style={{ color: '#888', fontSize: 16 }} />;
  return null;
}
