import React, { memo } from 'react';
import { HeartFilled, HeartOutlined, PlayCircleFilled } from '@ant-design/icons';
import { readerApi } from '../../services/api';
import { useLazyImage } from '../../hooks/useScrollAnimation';
import styles from './ComicCard.module.css';

function ComicCard({ comic, onRead, onFavorite, size = 'md' }) {
  const [hovered, setHovered] = React.useState(false);
  const rawCoverUrl = comic.cover_path || readerApi.getCoverUrl(comic.id);
  const [imgRef, lazySrc, , onImgLoad] = useLazyImage(rawCoverUrl);
  const progress = comic.total_pages > 0
    ? Math.round((comic.current_page / comic.total_pages) * 100)
    : 0;

  const actionLabel = progress > 0 && progress < 100 ? `${progress}%` : progress === 100 ? 'Done' : null;

  return (
    <div
      className={`${styles.card} ${styles[size]} ${hovered ? styles.hovered : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onRead}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onRead()}
      aria-label={`Read ${comic.title}`}
    >
      {/* Cover */}
      <div className={styles.coverWrap}>
        <img
          ref={imgRef}
          src={lazySrc || ''}
          alt={comic.title}
          className={styles.cover}
          onLoad={onImgLoad}
          style={{ opacity: lazySrc ? 1 : 0 }}
        />
        {/* Fallback letter when no cover yet */}
        {!lazySrc && (
          <div className={styles.coverFallback}>
            <span>{(comic.title || '?')[0].toUpperCase()}</span>
          </div>
        )}
        {/* Progress bar */}
        {progress > 0 && progress < 100 && (
          <div className={styles.progressRail}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        )}
        {/* Play icon — hover */}
        <div className={styles.playOverlay}>
          <PlayCircleFilled className={styles.playIcon} />
        </div>
      </div>

      {/* Hover info panel */}
      <div className={styles.infoPanel}>
        <div className={styles.infoPanelInner}>
          <div className={styles.infoTitle}>{comic.title}</div>
          <div className={styles.infoMeta}>
            {comic.series && <span className={styles.series}>{comic.series}</span>}
            {comic.page_count > 0 && <span>{comic.page_count} pages</span>}
            {actionLabel && <span className={styles.progress}>{actionLabel} read</span>}
          </div>
          <div className={styles.infoActions}>
            <button
              className={styles.playBtn}
              onClick={e => { e.stopPropagation(); onRead(); }}
              aria-label="Read"
            >
              <PlayCircleFilled />
            </button>
            <button
              className={`${styles.favIconBtn} ${comic.is_favorite ? styles.favActive : ''}`}
              onClick={e => { e.stopPropagation(); onFavorite(); }}
              aria-label="Favorite"
            >
              {comic.is_favorite ? <HeartFilled /> : <HeartOutlined />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(ComicCard, (prev, next) =>
  prev.comic.id === next.comic.id &&
  prev.comic.is_favorite === next.comic.is_favorite &&
  prev.comic.current_page === next.comic.current_page &&
  prev.size === next.size
);
