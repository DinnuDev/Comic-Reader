import React, { useRef, useState, useEffect } from 'react';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useScrollAnimation } from '../../hooks/useScrollAnimation';
import styles from './ComicCarousel.module.css';

export default function ComicCarousel({ title, children, emptyText, isLoading }) {
  const trackRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [sectionRef, visible] = useScrollAnimation({ threshold: 0.06, rootMargin: '0px 0px -40px 0px' });

  const SCROLL_AMOUNT = 880;

  const checkScrollability = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  };

  // Check after initial render
  useEffect(() => {
    const t = setTimeout(checkScrollability, 200);
    return () => clearTimeout(t);
  }, [children]);

  const scroll = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * SCROLL_AMOUNT, behavior: 'smooth' });
    setTimeout(checkScrollability, 350);
  };

  const count = React.Children.count(children);
  if (count === 0 && !isLoading) return null;

  return (
    <section
      ref={sectionRef}
      className={`${styles.section} ${visible ? styles.sectionVisible : styles.sectionHidden}`}
    >
      <h2 className={styles.heading}>{title}</h2>
      <div className={styles.row}>
        {canScrollLeft && (
          <button
            className={`${styles.arrow} ${styles.arrowLeft}`}
            onClick={() => scroll(-1)}
            aria-label="Scroll left"
          >
            <LeftOutlined />
          </button>
        )}
        <div
          ref={trackRef}
          className={styles.track}
          onScroll={checkScrollability}
        >
          {/* Stagger each child's animation */}
          {React.Children.map(children, (child, i) =>
            child ? (
              <div
                key={i}
                className={styles.cardSlot}
                style={{ animationDelay: visible ? `${Math.min(i * 45, 400)}ms` : '0ms' }}
              >
                {child}
              </div>
            ) : null
          )}
        </div>
        {canScrollRight && count > 4 && (
          <button
            className={`${styles.arrow} ${styles.arrowRight}`}
            onClick={() => scroll(1)}
            aria-label="Scroll right"
          >
            <RightOutlined />
          </button>
        )}
      </div>
    </section>
  );
}

