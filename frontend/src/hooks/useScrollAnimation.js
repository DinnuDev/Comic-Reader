import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Triggers a CSS "visible" class when an element enters the viewport.
 * Disconnects after first trigger (animate once).
 *
 * @param {object} options  IntersectionObserver options
 * @param {boolean} options.once  Disconnect after first trigger (default true)
 * @returns [ref, isVisible]
 */
export function useScrollAnimation(options = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const { threshold = 0.12, rootMargin = '0px 0px -60px 0px', once = true } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return [ref, visible];
}

/**
 * Returns a ref-callback that lazily sets the src of an <img> only when
 * it enters the viewport — for cards rendered outside the initial viewport.
 *
 * Usage:
 *   const [imgRef, lazySrc] = useLazyImage(originalSrc);
 *   <img ref={imgRef} src={lazySrc} ... />
 */
export function useLazyImage(src) {
  const ref = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [lazySrc, setLazySrc] = useState('');

  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLazySrc(src);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // start loading 200px before visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [src]);

  return [ref, lazySrc, loaded, () => setLoaded(true)];
}

/**
 * Page prefetch queue for the reader.
 * Preloads AHEAD pages ahead and BEHIND pages behind current page.
 */
export function usePrefetchQueue(getUrl, currentPage, totalPages, ahead = 3, behind = 1) {
  const cacheRef = useRef(new Set());

  useEffect(() => {
    const preload = (page) => {
      if (page < 0 || page >= totalPages) return;
      const url = getUrl(page);
      if (cacheRef.current.has(url)) return;
      cacheRef.current.add(url);
      const img = new Image();
      img.src = url;
    };

    for (let i = 1; i <= ahead; i++) preload(currentPage + i);
    for (let i = 1; i <= behind; i++) preload(currentPage - i);
  }, [currentPage, totalPages, getUrl, ahead, behind]);
}
