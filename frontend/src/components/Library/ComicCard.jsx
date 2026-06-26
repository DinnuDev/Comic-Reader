import React from 'react';
import { Tooltip } from 'antd';
import { HeartFilled, HeartOutlined, PlayCircleFilled } from '@ant-design/icons';
import { readerApi } from '../../services/api';
import styles from './ComicCard.module.css';

export default function ComicCard({ comic, onRead, onFavorite }) {
  const progress = comic.total_pages > 0
    ? Math.round((comic.current_page / comic.total_pages) * 100)
    : 0;

  const coverUrl = comic.cover_path
    ? comic.cover_path
    : readerApi.getCoverUrl(comic.id);

  return (
    <div className={styles.card} onClick={onRead}>
      <div className={styles.coverWrapper}>
        <img
          src={coverUrl}
          alt={comic.title}
          className={styles.cover}
          loading="lazy"
          onError={e => { e.target.src = 'data:image/svg+xml,' + encodeURIComponent(placeholderSvg(comic.title)); }}
        />
        <div className={styles.overlay}>
          <PlayCircleFilled className={styles.playIcon} />
        </div>
        {/* Favorite button */}
        <button
          className={styles.favBtn}
          onClick={e => { e.stopPropagation(); onFavorite(); }}
          aria-label={comic.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {comic.is_favorite
            ? <HeartFilled style={{ color: '#e94560' }} />
            : <HeartOutlined style={{ color: '#fff' }} />}
        </button>
        {/* Reading progress */}
        {progress > 0 && progress < 100 && (
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        )}
        {progress === 100 && (
          <div className={styles.readBadge}>READ</div>
        )}
      </div>
      <Tooltip title={comic.title} placement="bottom">
        <div className={styles.title}>{comic.title}</div>
      </Tooltip>
      {comic.series && <div className={styles.series}>{comic.series}</div>}
    </div>
  );
}

function placeholderSvg(title) {
  const letter = (title || '?')[0].toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
    <rect width="300" height="450" fill="#1a1a2e"/>
    <text x="150" y="240" font-size="100" text-anchor="middle" fill="#e94560" font-family="sans-serif">${letter}</text>
  </svg>`;
}
