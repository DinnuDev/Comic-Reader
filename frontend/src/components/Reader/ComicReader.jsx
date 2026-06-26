import React, {
  useState, useRef, useCallback, useEffect,
} from 'react';
import {
  Slider, Tooltip, Typography, Drawer,
  Modal, Input, message,
} from 'antd';
import {
  ArrowLeftOutlined, SettingOutlined, FullscreenOutlined,
  FullscreenExitOutlined, BookOutlined, UnorderedListOutlined,
  StarOutlined, StarFilled,
} from '@ant-design/icons';
import { progressApi } from '../../services/api';
import PageViewer from './PageViewer';
import ThumbnailStrip from './ThumbnailStrip';
import ReaderSettings from './ReaderSettings';
import { useAppStore } from '../../store';
import styles from './ComicReader.module.css';

const { Text } = Typography;
const CONTROLS_TIMEOUT = 3500;

export default function ComicReader({
  comicId, title, totalPages, initialPage = 0,
  onProgressChange, onClose, resumedFromPage,
}) {
  const { settings } = useAppStore();
  const [page, setPage] = useState(initialPage);
  const [showUI, setShowUI] = useState(true);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThumbs, setShowThumbs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showJumpModal, setShowJumpModal] = useState(false);
  const [jumpValue, setJumpValue] = useState('');
  const [bookmarks, setBookmarks] = useState([]);
  const [isCurrentBookmarked, setIsCurrentBookmarked] = useState(false);
  const [sliderDragging, setSliderDragging] = useState(false);
  const [sliderPreview, setSliderPreview] = useState(null);

  const containerRef = useRef(null);
  const uiTimerRef = useRef(null);
  const progressTimerRef = useRef(null);
  const keyHandlersRef = useRef({});
  // Resume banner: show briefly when opening mid-comic
  const [showResumeBanner, setShowResumeBanner] = useState(!!resumedFromPage);

  // Auto-hide resume banner after 3.5 s
  useEffect(() => {
    if (!showResumeBanner) return;
    const t = setTimeout(() => setShowResumeBanner(false), 3500);
    return () => clearTimeout(t);
  }, [showResumeBanner]);

  // Load bookmarks
  useEffect(() => {
    progressApi.getBookmarks(comicId)
      .then(bm => { setBookmarks(bm); setIsCurrentBookmarked(bm.some(b => b.page === page)); })
      .catch(() => {});
  }, [comicId]);

  // Update bookmark indicator on page change
  useEffect(() => {
    setIsCurrentBookmarked(bookmarks.some(b => b.page === page));
  }, [page, bookmarks]);

  // Auto-save progress
  useEffect(() => {
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = setTimeout(() => {
      onProgressChange?.(page, totalPages);
    }, 1200);
    return () => clearTimeout(progressTimerRef.current);
  }, [page, totalPages, onProgressChange]);

  // Auto-hide UI
  const showUITemporarily = useCallback(() => {
    setShowUI(true);
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    if (!isZoomed) {
      uiTimerRef.current = setTimeout(() => setShowUI(false), CONTROLS_TIMEOUT);
    }
  }, [isZoomed]);

  useEffect(() => {
    showUITemporarily();
    return () => { if (uiTimerRef.current) clearTimeout(uiTimerRef.current); };
  }, [showUITemporarily]);

  // Keyboard — register once, always read latest handlers via ref
  useEffect(() => {
    const h = (e) => {
      const { goNext, goPrev, toggleFullscreen, toggleBookmark } = keyHandlersRef.current;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext?.();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev?.();
      else if (e.key === 'Escape') {
        if (document.fullscreenElement) document.exitFullscreen();
        else keyHandlersRef.current.onClose?.();
      }
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen?.();
      else if (e.key === 'b' || e.key === 'B') toggleBookmark?.();
      else if (e.key === 'g' || e.key === 'G') keyHandlersRef.current.setShowJumpModal?.(true);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []); // empty — always reads fresh handlers from keyHandlersRef

  // Fullscreen change listener
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const goNext = useCallback(() => setPage(p => Math.min(p + 1, totalPages - 1)), [totalPages]);
  const goPrev = useCallback(() => setPage(p => Math.max(p - 1, 0)), []);
  const goTo = useCallback((n) => setPage(Math.max(0, Math.min(n, totalPages - 1))), [totalPages]);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }, []);

  const toggleBookmark = useCallback(async () => {
    if (isCurrentBookmarked) {
      const bm = bookmarks.find(b => b.page === page);
      if (bm) {
        await progressApi.deleteBookmark(comicId, bm.id);
        setBookmarks(prev => prev.filter(b => b.id !== bm.id));
        setIsCurrentBookmarked(false);
        message.info('Bookmark removed');
      }
    } else {
      const bm = await progressApi.addBookmark(comicId, { page, label: `Page ${page + 1}` });
      setBookmarks(prev => [...prev, bm]);
      setIsCurrentBookmarked(true);
      message.success('Bookmarked!');
    }
  }, [comicId, page, bookmarks, isCurrentBookmarked]);

  const handleJump = () => {
    const n = parseInt(jumpValue) - 1;
    if (!isNaN(n)) { goTo(n); setShowJumpModal(false); setJumpValue(''); }
  };

  // Memoized zoom-change handler — stable reference so PageViewer never
  // sees a new prop reference and re-triggers its page-transition effect.
  const handleZoomChange = useCallback((z) => {
    setIsZoomed(z);
    if (!z) showUITemporarily();
  }, [showUITemporarily]);

  const handleTap = useCallback(() => {
    setShowUI(v => {
      if (v) {
        clearTimeout(uiTimerRef.current);
        return false;
      }
      showUITemporarily();
      return true;
    });
  }, [showUITemporarily]);

  const progress = totalPages > 1 ? (page / (totalPages - 1)) * 100 : 0;
  const readingTime = Math.max(1, Math.round((totalPages - page) * 0.3));

  // Update key-handler ref every render so keyboard effect never goes stale
  keyHandlersRef.current = { goNext, goPrev, onClose, toggleFullscreen, toggleBookmark, setShowJumpModal };

  return (
    <div
      ref={containerRef}
      className={styles.reader}
      style={{ background: settings.backgroundColor || '#000' }}
      onMouseMove={showUITemporarily}
    >

      {/* ── RESUME BANNER (auto-dismisses) ─────────────── */}
      {showResumeBanner && resumedFromPage > 0 && (
        <div className={styles.resumeBanner}>
          <span>▶ Resumed from page {resumedFromPage + 1}</span>
          <button className={styles.resumeDismiss} onClick={() => setShowResumeBanner(false)}>✕</button>
        </div>
      )}

      {/* ── PAGE VIEWER ────────────────────────────────── */}
      <PageViewer
        comicId={comicId}
        currentPage={page}
        totalPages={totalPages}
        settings={settings}
        onNext={goNext}
        onPrev={goPrev}
        onTap={handleTap}
        onZoomChange={handleZoomChange}
      />

      {/* ── TOP BAR ────────────────────────────────────── */}
      <div className={`${styles.topBar} ${showUI && !isZoomed ? styles.visible : styles.hidden}`}>
        <button className={styles.iconBtn} onClick={onClose} aria-label="Back">
          <ArrowLeftOutlined />
        </button>
        <div className={styles.titleArea}>
          <Text className={styles.titleText} ellipsis>{title}</Text>
          {readingTime > 0 && (
            <Text className={styles.subtitle}>{readingTime} min left</Text>
          )}
        </div>
        <div className={styles.topActions}>
          <Tooltip title={`Bookmark (B)`}>
            <button
              className={`${styles.iconBtn} ${isCurrentBookmarked ? styles.bookmarked : ''}`}
              onClick={toggleBookmark}
              aria-label="Bookmark"
            >
              {isCurrentBookmarked ? <StarFilled /> : <StarOutlined />}
            </button>
          </Tooltip>
          <Tooltip title="Table of contents">
            <button className={styles.iconBtn} onClick={() => setShowThumbs(true)} aria-label="Thumbnails">
              <UnorderedListOutlined />
            </button>
          </Tooltip>
          <Tooltip title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}>
            <button className={styles.iconBtn} onClick={toggleFullscreen} aria-label="Fullscreen">
              {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            </button>
          </Tooltip>
          <Tooltip title="Settings">
            <button className={styles.iconBtn} onClick={() => setShowSettings(true)} aria-label="Settings">
              <SettingOutlined />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ── BOTTOM CONTROLS ────────────────────────────── */}
      <div className={`${styles.bottomBar} ${showUI && !isZoomed ? styles.visible : styles.hidden}`}>
        <div className={styles.bottomInner}>
          {/* Prev/slider/next row */}
          <div className={styles.navRow}>
            <button
              className={styles.navBtn}
              onClick={goPrev}
              disabled={page === 0}
              aria-label="Previous"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>

            <div className={styles.sliderWrap}>
              <Slider
                min={0}
                max={Math.max(0, totalPages - 1)}
                value={sliderDragging ? sliderPreview : page}
                onChange={(v) => { setSliderDragging(true); setSliderPreview(v); }}
                onChangeComplete={(v) => { goTo(v); setSliderDragging(false); setSliderPreview(null); }}
                tooltip={{
                  formatter: v => `${(v ?? page) + 1} / ${totalPages}`,
                  open: sliderDragging,
                }}
                className={styles.slider}
              />
            </div>

            <button
              className={styles.navBtn}
              onClick={goNext}
              disabled={page >= totalPages - 1}
              aria-label="Next"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Page counter */}
          <button
            className={styles.pageCounter}
            onClick={() => setShowJumpModal(true)}
            aria-label="Jump to page"
          >
            Page {page + 1} of {totalPages}
          </button>
        </div>
      </div>

      {/* ── ALWAYS-VISIBLE THIN PROGRESS BAR ───────────── */}
      <div className={styles.progressRail}>
        <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        {/* Bookmark tick marks */}
        {bookmarks.map(bm => (
          <div
            key={bm.id}
            className={styles.bookmarkTick}
            style={{ left: `${(bm.page / Math.max(totalPages - 1, 1)) * 100}%` }}
            title={bm.label}
          />
        ))}
      </div>

      {/* ── PAGE NUMBER ALWAYS VISIBLE ─────────────────── */}
      {!showUI && (
        <div
          className={styles.floatingPageNum}
          onClick={() => { showUITemporarily(); }}
        >
          {page + 1} / {totalPages}
        </div>
      )}

      {/* ── THUMBNAIL DRAWER ───────────────────────────── */}
      <Drawer
        title={
          <span>
            <BookOutlined style={{ marginRight: 8 }} />{title}
          </span>
        }
        placement="bottom"
        height={172}
        open={showThumbs}
        onClose={() => setShowThumbs(false)}
        mask={false}
        className={styles.thumbDrawer}
        extra={<Text type="secondary">{totalPages} pages</Text>}
      >
        <ThumbnailStrip
          comicId={comicId}
          totalPages={totalPages}
          currentPage={page}
          bookmarks={bookmarks}
          onSelect={(p) => { goTo(p); setShowThumbs(false); }}
        />
      </Drawer>

      {/* ── SETTINGS DRAWER ────────────────────────────── */}
      <ReaderSettings open={showSettings} onClose={() => setShowSettings(false)} />

      {/* ── JUMP TO PAGE MODAL ─────────────────────────── */}
      <Modal
        title="Go to page"
        open={showJumpModal}
        onOk={handleJump}
        onCancel={() => { setShowJumpModal(false); setJumpValue(''); }}
        okText="Go"
        width={300}
        centered
      >
        <Input
          type="number"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={e => setJumpValue(e.target.value)}
          onPressEnter={handleJump}
          placeholder={`1 – ${totalPages}`}
          suffix={`/ ${totalPages}`}
          autoFocus
        />
      </Modal>
    </div>
  );
}
