import React from 'react';
import styles from './SkeletonCard.module.css';

/**
 * Shimmer placeholder matching ComicCard dimensions.
 */
export default function SkeletonCard({ size = 'md' }) {
  return (
    <div className={`${styles.card} ${styles[size]}`} aria-hidden="true">
      <div className={styles.cover}>
        <div className={styles.shimmer} />
      </div>
      <div className={styles.lines}>
        <div className={`${styles.line} ${styles.lineTitle}`} />
        <div className={`${styles.line} ${styles.lineMeta}`} />
      </div>
    </div>
  );
}

/** Render N skeleton cards in a carousel row. */
export function SkeletonCarousel({ count = 8, title }) {
  return (
    <section className={styles.section}>
      {title && <div className={`${styles.skeletonHeading}`} />}
      <div className={styles.track}>
        {Array.from({ length: count }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </section>
  );
}
