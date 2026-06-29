import React, { memo } from 'react';
import {
  HeartFilled, HeartOutlined, PlayCircleFilled, DeleteOutlined, CheckCircleFilled,
} from '@ant-design/icons';
import { readerApi } from '../../services/api';
import styles from './ComicCard.module.css';

function ComicCard({
  comic,
  onRead,
  onFavorite,
  onOffload,
  bulkMode = false,
  selected = false,
  onToggleSelect,
  size = 'md',
}) {
  const [hovered, setHovered] = React.useState(false);
  const [useFallbackCover, setUseFallbackCover] = React.useState(false);
  const [imgLoaded, setImgLoaded] = React.useState(false);
  const primaryCoverUrl = comic.cover_path
    ? `${comic.cover_path}${comic.cover_path.includes('?') ? '&' : '?'}t=${comic.date_added || ''}`
    : '';
  const fallbackCoverUrl = `${readerApi.getCoverUrl(comic.id)}?t=${comic.date_added || ''}`;
  const coverUrl = useFallbackCover || !primaryCoverUrl ? fallbackCoverUrl : primaryCoverUrl;
  const progress = comic.total_pages > 0
    ? Math.round((comic.current_page / comic.total_pages) * 100)
    : 0;

  React.useEffect(() => {
    setUseFallbackCover(false);
    setImgLoaded(false);
  }, [primaryCoverUrl, comic.id]);

  const actionLabel = progress > 0 && progress < 100 ? `${progress}%` : progress === 100 ? 'Done' : null;

  const handleCardClick = () => {
    if (bulkMode) {
      onToggleSelect?.(comic.id);
      return;
    }
    onRead();
  };

  return (
    <div
      className={`${styles.card} ${styles[size]} ${hovered ? styles.hovered : ''} ${bulkMode ? styles.bulkMode : ''} ${selected ? styles.selected : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && handleCardClick()}
      aria-label={`Read ${comic.title}`}
    >
      {/* Cover */}
      <div className={styles.coverWrap}>
        <img
          src={coverUrl}
          alt={comic.title}
          className={styles.cover}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            if (!useFallbackCover && primaryCoverUrl) {
              setUseFallbackCover(true);
              setImgLoaded(false);
            }
          }}
          style={{ opacity: imgLoaded ? 1 : 0 }}
        />
        {/* Fallback letter when no cover yet */}
        {!imgLoaded && (
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

        {bulkMode && (
          <div className={`${styles.selectBadge} ${selected ? styles.selectBadgeActive : ''}`}>
            {selected ? <CheckCircleFilled /> : <span className={styles.selectBadgeDot} />}
          </div>
        )}
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
            <button
              className={styles.offloadBtn}
              onClick={e => { e.stopPropagation(); onOffload?.(comic); }}
              aria-label="Offload"
              title="Offload comic"
            >
              <DeleteOutlined />
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
  prev.comic.cover_path === next.comic.cover_path &&
  prev.comic.page_count === next.comic.page_count &&
  prev.bulkMode === next.bulkMode &&
  prev.selected === next.selected &&
  prev.size === next.size
);
