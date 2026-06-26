import React, {
  useState, useRef, useCallback, useEffect,
} from 'react';
import { useSpring, animated } from '@react-spring/web';
import { useDrag, usePinch } from '@use-gesture/react';
import { readerApi } from '../../services/api';
import { usePrefetchQueue } from '../../hooks/useScrollAnimation';
import styles from './PageViewer.module.css';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const DOUBLE_TAP_ZOOM = 2.2;
const SWIPE_THRESHOLD = 40;
const SWIPE_VELOCITY = 0.2;

export default function PageViewer({
  comicId, currentPage, totalPages, settings,
  onNext, onPrev, onTap, onZoomChange,
}) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  const [imgSpring, imgApi] = useSpring(() => ({
    x: 0, y: 0, scale: 1,
    config: { tension: 320, friction: 30 },
  }));
  const [pageSpring, pageApi] = useSpring(() => ({
    x: 0, opacity: 1,
    config: { tension: 300, friction: 30 },
  }));

  // Internal state refs — survive re-renders without causing dependency chains
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);
  const dragMovedRef = useRef(false);
  const prevPageRef = useRef(currentPage);
  const isZoomedRef = useRef(false);

  // Props ref — always fresh, never a dep in effects/gestures
  const propsRef = useRef({ onNext, onPrev, onTap, onZoomChange });
  propsRef.current = { onNext, onPrev, onTap, onZoomChange };

  // Settings ref — prevents spurious transition-effect fires
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // ── Inline zoom reset (no useCallback dep, called directly) ───────────────
  const applyZoomReset = useCallback((immediate) => {
    zoomRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    isZoomedRef.current = false;
    setIsZoomed(false);
    setZoomLevel(1);
    propsRef.current.onZoomChange?.(false);
    imgApi.start({ x: 0, y: 0, scale: 1, immediate });
  }, [imgApi]); // imgApi is stable (spring API never changes)

  // ── Page transition — ONLY fires when currentPage changes ─────────────────
  useEffect(() => {
    const dir = currentPage > prevPageRef.current ? -1 : 1;
    prevPageRef.current = currentPage;
    setImageLoaded(false);

    // Inline zoom reset so we don't depend on applyZoomReset reference
    zoomRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    isZoomedRef.current = false;
    setIsZoomed(false);
    setZoomLevel(1);
    propsRef.current.onZoomChange?.(false);
    imgApi.set({ x: 0, y: 0, scale: 1 });

    if (settingsRef.current?.transitionAnimation === 'none') {
      pageApi.set({ x: 0, opacity: 1 });
      return;
    }
    const w = containerRef.current?.clientWidth ?? window.innerWidth;
    pageApi.set({ x: dir * w * 0.25, opacity: 0.6 });
    pageApi.start({ x: 0, opacity: 1 });
  }, [currentPage]); // ONLY fires on page change — all other refs are stable

  // ── Helpers ───────────────────────────────────────────────────────────────
  const clampPan = useCallback((x, y, scale) => {
    if (!containerRef.current || !imgRef.current) return { x, y };
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const iw = imgRef.current.naturalWidth || cw;
    const ih = imgRef.current.naturalHeight || ch;
    const aspect = iw / ih;
    const dw = aspect > cw / ch ? cw : ch * aspect;
    const dh = aspect > cw / ch ? cw / aspect : ch;
    return {
      x: Math.max(-(dw * scale - cw) / 2, Math.min((dw * scale - cw) / 2, x)),
      y: Math.max(-(dh * scale - ch) / 2, Math.min((dh * scale - ch) / 2, y)),
    };
  }, []);

  const applyZoom = useCallback((targetScale, focusX, focusY) => {
    if (!containerRef.current) return;
    const { clientWidth: cw, clientHeight: ch } = containerRef.current;
    const r = targetScale / (zoomRef.current || 1);
    const nx = offsetRef.current.x * r - ((focusX ?? cw / 2) - cw / 2) * (r - 1);
    const ny = offsetRef.current.y * r - ((focusY ?? ch / 2) - ch / 2) * (r - 1);
    const clamped = clampPan(nx, ny, targetScale);
    zoomRef.current = targetScale;
    offsetRef.current = clamped;
    const zoomed = targetScale > 1.05;
    isZoomedRef.current = zoomed;
    setIsZoomed(zoomed);
    setZoomLevel(Math.round(targetScale * 10) / 10);
    propsRef.current.onZoomChange?.(zoomed);
    imgApi.start({ scale: targetScale, x: clamped.x, y: clamped.y });
  }, [imgApi, clampPan]);

  const smartZoomToPanel = useCallback((clientX, clientY) => {
    if (!containerRef.current || !imgRef.current) return;
    if (isZoomedRef.current) { applyZoomReset(false); return; }
    const rect = containerRef.current.getBoundingClientRect();
    const tapX = clientX - rect.left;
    const tapY = clientY - rect.top;
    const { width: cw, height: ch } = rect;
    const iw = imgRef.current.naturalWidth || cw;
    const ih = imgRef.current.naturalHeight || ch;
    const cols = iw > ih * 1.3 ? 3 : 2;
    const rows = iw > ih ? 2 : 3;
    const pW = 1 / cols, pH = 1 / rows;
    const pX = Math.floor((tapX / cw) * cols) / cols;
    const pY = Math.floor((tapY / ch) * rows) / rows;
    const ts = Math.min((1 / pW) * 0.88, (1 / pH) * 0.88, MAX_ZOOM);
    applyZoom(ts, (pX + pW / 2) * cw, (pY + pH / 2) * ch);
  }, [applyZoom, applyZoomReset]);

  // ── DRAG ──────────────────────────────────────────────────────────────────
  useDrag(({ active, movement: [mx, my], velocity: [vx], direction: [dx], first, last }) => {
    if (first) dragMovedRef.current = false;
    if (Math.abs(mx) > 5 || Math.abs(my) > 5) dragMovedRef.current = true;
    setIsDragging(active && dragMovedRef.current);

    if (isZoomedRef.current) {
      const c = clampPan(offsetRef.current.x + mx, offsetRef.current.y + my, zoomRef.current);
      if (last) { offsetRef.current = c; imgApi.start({ x: c.x, y: c.y }); }
      else imgApi.start({ x: c.x, y: c.y, immediate: true });
    } else {
      if (last) {
        if (dragMovedRef.current && (Math.abs(mx) > SWIPE_THRESHOLD || Math.abs(vx) > SWIPE_VELOCITY)) {
          dx < 0 ? propsRef.current.onNext?.() : propsRef.current.onPrev?.();
        }
        pageApi.start({ x: 0 });
      } else if (dragMovedRef.current) {
        pageApi.start({ x: mx * 0.18, immediate: true });
      }
    }
  }, { target: containerRef, filterTaps: true, pointer: { touch: true, mouse: true } });

  // ── PINCH ─────────────────────────────────────────────────────────────────
  usePinch(({ offset: [scale], origin: [ox, oy] }) => {
    const ns = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
    if (!containerRef.current) return;
    if (ns <= 1.02) { applyZoomReset(false); return; }
    const rect = containerRef.current.getBoundingClientRect();
    const { width: cw, height: ch } = rect;
    const ratio = ns / (zoomRef.current || 1);
    const cx = ox - rect.left, cy = oy - rect.top;
    const c = clampPan(
      offsetRef.current.x * ratio - (cx - cw / 2) * (ratio - 1),
      offsetRef.current.y * ratio - (cy - ch / 2) * (ratio - 1),
      ns
    );
    offsetRef.current = c; zoomRef.current = ns;
    const zoomed = ns > 1.05;
    isZoomedRef.current = zoomed;
    setIsZoomed(zoomed); setZoomLevel(Math.round(ns * 10) / 10);
    propsRef.current.onZoomChange?.(zoomed);
    imgApi.start({ scale: ns, x: c.x, y: c.y, immediate: true });
  }, { target: containerRef, scaleBounds: { min: MIN_ZOOM, max: MAX_ZOOM }, rubberband: true });

  // ── CLICK / TAP ───────────────────────────────────────────────────────────
  const handleClick = useCallback((e) => {
    if (dragMovedRef.current) return;
    const now = Date.now();
    const dt = now - lastTapRef.current;
    lastTapRef.current = now;

    // Double tap
    if (dt < 260) {
      if (isZoomedRef.current) applyZoomReset(false);
      else {
        const r = containerRef.current.getBoundingClientRect();
        applyZoom(DOUBLE_TAP_ZOOM, e.clientX - r.left, e.clientY - r.top);
      }
      return;
    }

    // Single tap — zones
    const rect = containerRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;

    if (!isZoomedRef.current) {
      if (relX < 0.22) { propsRef.current.onPrev?.(); return; }
      if (relX > 0.78) { propsRef.current.onNext?.(); return; }
      // Center tap — smart panel zoom
      smartZoomToPanel(e.clientX, e.clientY);
    }
    propsRef.current.onTap?.();
  }, [applyZoom, applyZoomReset, smartZoomToPanel]);

  // ── Smart prefetch: load 3 ahead, 1 behind, using a persistent cache ─────
  const getPageUrl = useCallback(
    (page) => readerApi.getPageUrl(comicId, page),
    [comicId]
  );
  usePrefetchQueue(getPageUrl, currentPage, totalPages, 3, 1);

  const pageUrl = getPageUrl(currentPage);

  return (
    <div
      ref={containerRef}
      className={`${styles.container} no-select`}
      onClick={handleClick}
      style={{ cursor: isDragging ? 'grabbing' : isZoomed ? 'grab' : 'default' }}
    >
      <animated.div
        className={styles.pageTrans}
        style={{ x: pageSpring.x, opacity: pageSpring.opacity }}
      >
        <animated.div
          className={styles.imageWrapper}
          style={{ x: imgSpring.x, y: imgSpring.y, scale: imgSpring.scale, touchAction: 'none' }}
        >
          <img
            ref={imgRef}
            key={currentPage}
            src={pageUrl}
            alt={`Page ${currentPage + 1}`}
            className={styles.img}
            draggable={false}
            onLoad={() => setImageLoaded(true)}
            style={{ opacity: imageLoaded ? 1 : 0, transition: 'opacity 0.2s' }}
          />
          {!imageLoaded && (
            <div className={styles.shimmer}>
              <div className={styles.shimmerAnim} />
            </div>
          )}
        </animated.div>
      </animated.div>

      {/* Side navigation chevrons — visible on hover */}
      {!isZoomed && (
        <>
          <button
            className={`${styles.navZone} ${styles.navLeft} ${currentPage === 0 ? styles.navDisabled : ''}`}
            onClick={e => { e.stopPropagation(); if (currentPage > 0) propsRef.current.onPrev?.(); }}
            aria-label="Previous page"
          >
            <svg width="28" height="52" viewBox="0 0 28 52" fill="none">
              <path d="M20 4L8 26L20 48" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className={`${styles.navZone} ${styles.navRight} ${currentPage >= totalPages - 1 ? styles.navDisabled : ''}`}
            onClick={e => { e.stopPropagation(); if (currentPage < totalPages - 1) propsRef.current.onNext?.(); }}
            aria-label="Next page"
          >
            <svg width="28" height="52" viewBox="0 0 28 52" fill="none">
              <path d="M8 4L20 26L8 48" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </>
      )}

      {/* Zoom level pill */}
      {isZoomed && (
        <div className={styles.zoomPill} onClick={e => { e.stopPropagation(); applyZoomReset(false); }}>
          {zoomLevel.toFixed(1)}× — tap to reset
        </div>
      )}

      {/* Loading indicator — thin top bar */}
      {!imageLoaded && (
        <div className={styles.loadBar}>
          <div className={styles.loadBarFill} />
        </div>
      )}
    </div>
  );
}
