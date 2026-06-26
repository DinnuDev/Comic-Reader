import React from 'react';
import { SyncOutlined } from '@ant-design/icons';
import styles from './ProcessingCard.module.css';

/**
 * Ghost card shown in the library while a comic is uploading or being indexed.
 * Matches ComicCard dimensions so the grid doesn't reflow when it transitions
 * to a real card.
 */
export default function ProcessingCard({ item }) {
  const { title, status, percent = 0 } = item;
  const isUploading = status === 'uploading';
  const isIndexing  = status === 'indexing';

  return (
    <div className={styles.card} title={title}>
      {/* Cover area — shimmer + progress indicator */}
      <div className={styles.cover}>
        <div className={styles.shimmer} />

        <div className={styles.overlay}>
          {isUploading ? (
            <ProgressRing percent={percent} />
          ) : (
            <div className={styles.indexingIcon}>
              <SyncOutlined spin style={{ fontSize: 22, color: '#e50914' }} />
              <span className={styles.indexingLabel}>Indexing…</span>
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      <div className={styles.meta}>
        <div className={styles.title}>{title}</div>
        <div className={styles.status}>
          {isUploading
            ? `Uploading ${percent}%`
            : 'Processing in background'}
        </div>
      </div>
    </div>
  );
}

/** SVG circular progress ring */
function ProgressRing({ percent }) {
  const r = 15.9;
  const circ = 2 * Math.PI * r; // ≈ 100 for this radius — convenient
  const dash = (percent / 100) * circ;

  return (
    <svg className={styles.ring} viewBox="0 0 36 36" aria-label={`${percent}% uploaded`}>
      {/* Track */}
      <circle
        cx="18" cy="18" r={r}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="2.5"
      />
      {/* Progress arc */}
      <circle
        cx="18" cy="18" r={r}
        fill="none"
        stroke="#e50914"
        strokeWidth="2.5"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ * 0.25} /* start at 12 o'clock */
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
      {/* Percentage label */}
      <text x="18" y="21" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#fff">
        {percent}%
      </text>
    </svg>
  );
}
