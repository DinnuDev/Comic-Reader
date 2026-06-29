import React, { useEffect, useState } from 'react';
import { SyncOutlined } from '@ant-design/icons';
import { readerApi } from '../../services/api';
import styles from './ProcessingCard.module.css';

/**
 * Ghost card shown in the library while a comic is uploading or being indexed.
 * Matches ComicCard dimensions so the grid doesn't reflow when it transitions
 * to a real card.
 */
export default function ProcessingCard({ item }) {
  const { title, status, percent = 0, thumbnailUrl, comicId } = item;
  const isUploading = status === 'uploading';
  const statusLabel = isUploading ? `Uploading ${percent}%` : 'Indexing in background';
  const [thumbFailed, setThumbFailed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const effectiveThumbnailUrl = thumbnailUrl || (comicId ? readerApi.getCoverUrl(comicId) : '');

  useEffect(() => {
    setThumbFailed(false);
    setRetryTick(0);
  }, [effectiveThumbnailUrl]);

  const canRetry = status === 'uploading' || status === 'indexing';
  const srcWithRetry = effectiveThumbnailUrl
    ? `${effectiveThumbnailUrl}${effectiveThumbnailUrl.includes('?') ? '&' : '?'}r=${retryTick}`
    : '';

  const handleThumbError = () => {
    if (!canRetry || retryTick >= 12) {
      setThumbFailed(true);
      return;
    }

    setThumbFailed(true);
    setTimeout(() => {
      setThumbFailed(false);
      setRetryTick(t => t + 1);
    }, 1200);
  };

  return (
    <div className={styles.card} title={title}>
      {/* Cover area — thumbnail with loading overlay */}
      <div className={styles.cover}>
        {effectiveThumbnailUrl && !thumbFailed ? (
          <img
            className={styles.thumb}
            src={srcWithRetry}
            alt={title}
            onError={handleThumbError}
          />
        ) : (
          <div className={styles.shimmer} />
        )}

        <div className={`${styles.overlay} ${styles.greyPulse}`}>
          {isUploading ? (
            <div className={styles.statusPill}>{percent}%</div>
          ) : (
            <div className={styles.indexingIcon}>
              <SyncOutlined spin style={{ fontSize: 22, color: '#e50914' }} />
              <span className={styles.indexingLabel}>Indexing…</span>
            </div>
          )}
        </div>

        {isUploading && (
          <div className={styles.progressRail}>
            <div className={styles.progressFill} style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>

      {/* Title */}
      <div className={styles.meta}>
        <div className={styles.title}>{title}</div>
        <div className={styles.status}>{statusLabel}</div>
      </div>
    </div>
  );
}
