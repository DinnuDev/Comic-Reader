import React, { useRef, useEffect } from 'react';
import { readerApi } from '../../services/api';
import styles from './ThumbnailStrip.module.css';

export default function ThumbnailStrip({ comicId, totalPages, currentPage, bookmarks = [], onSelect }) {
  const stripRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [currentPage]);

  const bookmarkPages = new Set((bookmarks || []).map(b => b.page));

  return (
    <div ref={stripRef} className={styles.strip}>
      {Array.from({ length: totalPages }, (_, i) => (
        <button
          key={i}
          ref={i === currentPage ? activeRef : null}
          className={`${styles.thumb} ${i === currentPage ? styles.active : ''} ${bookmarkPages.has(i) ? styles.bookmarked : ''}`}
          onClick={() => onSelect(i)}
          aria-label={`Go to page ${i + 1}`}
        >
          <img
            src={readerApi.getPageUrl(comicId, i)}
            alt={`Page ${i + 1}`}
            className={styles.img}
            loading="lazy"
          />
          <span className={styles.num}>{i + 1}</span>
          {bookmarkPages.has(i) && <span className={styles.bookmarkDot} />}
        </button>
      ))}
    </div>
  );
}


