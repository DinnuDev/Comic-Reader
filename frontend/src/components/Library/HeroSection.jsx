import React, { useState, useEffect } from 'react';
import { Button, Tag } from 'antd';
import { PlayCircleFilled, InfoCircleOutlined, HeartFilled, HeartOutlined } from '@ant-design/icons';
import { readerApi } from '../../services/api';
import styles from './HeroSection.module.css';

export default function HeroSection({ comic, onRead, onFavorite }) {
  const [imgError, setImgError] = useState(false);
  const coverUrl = comic.cover_path || readerApi.getCoverUrl(comic.id);
  const progress = comic.total_pages > 0
    ? Math.round((comic.current_page / comic.total_pages) * 100)
    : 0;

  const label = progress > 0 && progress < 100
    ? `Continue — ${progress}%`
    : progress === 100 ? 'Read Again' : 'Read Now';

  return (
    <div className={styles.hero}>
      {/* Backdrop image */}
      <div className={styles.backdrop}>
        <img
          src={coverUrl}
          alt={comic.title}
          className={styles.backdropImg}
          onError={() => setImgError(true)}
        />
        <div className={styles.backdropGradient} />
      </div>

      {/* Content */}
      <div className={styles.content}>
        {comic.series && (
          <div className={styles.series}>{comic.series}</div>
        )}
        <h1 className={styles.title}>{comic.title}</h1>

        <div className={styles.meta}>
          {comic.year && <Tag className={styles.metaTag}>{comic.year}</Tag>}
          {comic.page_count > 0 && (
            <Tag className={styles.metaTag}>{comic.page_count} pages</Tag>
          )}
          {comic.file_type && (
            <Tag className={styles.metaTag}>{comic.file_type.toUpperCase()}</Tag>
          )}
          {progress > 0 && (
            <Tag color="gold" className={styles.metaTag}>{progress}% read</Tag>
          )}
        </div>

        {/* Progress bar */}
        {progress > 0 && progress < 100 && (
          <div className={styles.progressWrap}>
            <div className={styles.progressBar} style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className={styles.actions}>
          <Button
            type="primary"
            size="large"
            icon={<PlayCircleFilled />}
            onClick={onRead}
            className={styles.readBtn}
          >
            {label}
          </Button>
          <button
            className={`${styles.favBtn} ${comic.is_favorite ? styles.favActive : ''}`}
            onClick={e => { e.stopPropagation(); onFavorite(); }}
            aria-label="Favorite"
          >
            {comic.is_favorite ? <HeartFilled /> : <HeartOutlined />}
          </button>
        </div>
      </div>
    </div>
  );
}
