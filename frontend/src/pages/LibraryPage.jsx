import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notification, Button, Modal, Tooltip } from 'antd';
import {
  UploadOutlined,
  PlusCircleOutlined,
  ReloadOutlined,
  DeleteOutlined,
  CheckSquareOutlined,
  CopyOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { libraryApi, sourcesApi, readerApi } from '../services/api';
import ComicCard from '../components/Library/ComicCard';
import ProcessingCard from '../components/Library/ProcessingCard';
import HeroSection from '../components/Library/HeroSection';
import ComicCarousel from '../components/Library/ComicCarousel';
import { SkeletonCarousel } from '../components/Library/SkeletonCard';
import DropZone from '../components/Upload/DropZone';
import SearchResults from '../components/Library/SearchResults';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import { useProcessingPoller } from '../hooks/useProcessingPoller';
import { useAppStore } from '../store';
import styles from './LibraryPage.module.css';

function normalizeTitleKey(title) {
  return (title || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Animated wrapper for the hero
function AnimatedHero({ children }) {
  const [ref, visible] = useScrollAnimation({ threshold: 0.01, rootMargin: '0px' });
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(12px)',
      transition: 'opacity 0.6s ease, transform 0.6s ease',
    }}>
      {children}
    </div>
  );
}

export default function LibraryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { uploadQueue } = useAppStore();

  const [uploadDialogKey, setUploadDialogKey] = useState(0);
  const [scanningId, setScanningId] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedComicIds, setSelectedComicIds] = useState([]);
  const [notifApi, ctxHolder] = notification.useNotification();

  const urlSearch = searchParams.get('search') || '';

  // ── Google Drive OAuth callback ──────────────────────────────────────────
  useEffect(() => {
    const gdrive = searchParams.get('gdrive');
    const reason = searchParams.get('reason');
    if (gdrive === 'connected') {
      notifApi.success({ message: 'Google Drive Connected!' });
      setSearchParams({});
    } else if (gdrive === 'error') {
      const msg = reason === 'invalid_grant'
        ? 'Auth code expired — please try again.'
        : reason ? decodeURIComponent(reason) : 'Connection failed.';
      notifApi.error({ message: 'Google Drive Error', description: msg, duration: 8 });
      setSearchParams({});
    }
  }, [searchParams]);

  // ── Library data ─────────────────────────────────────────────────────────
  const { data: allData, isLoading } = useQuery({
    queryKey: ['library', urlSearch],
    queryFn: () => libraryApi.getAll({
      search: urlSearch || undefined,
      sort: 'date_added', order: 'desc', limit: 200,
    }),
    refetchInterval: (data) => {
      // Auto-refetch every 3 s while any comic is still processing
      const hasProcessing = (data?.comics || []).some(c => c.page_count === 0);
      return hasProcessing ? 3000 : false;
    },
  });

  const { data: recentComics } = useQuery({
    queryKey: ['recent'],
    queryFn: libraryApi.getRecent,
  });

  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: sourcesApi.getAll,
  });

  // ── Background indexing poller ───────────────────────────────────────────
  useProcessingPoller(allData?.comics || []);

  // ── Mutations ────────────────────────────────────────────────────────────
  const favMutation = useMutation({
    mutationFn: libraryApi.toggleFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['recent'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: libraryApi.deleteComic,
    onSuccess: () => {
      notifApi.success({ message: 'Comic offloaded' });
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['recent'] });
    },
    onError: (err) => {
      notifApi.error({
        message: 'Failed to offload comic',
        description: err?.response?.data?.error || err?.message || 'Unknown error',
      });
    },
  });

  const handleScanAll = async () => {
    for (const s of (sources || [])) {
      setScanningId(s.id);
      try { await libraryApi.scanSource(s.id); } catch {}
    }
    setScanningId(null);
    queryClient.invalidateQueries({ queryKey: ['library'] });
    queryClient.invalidateQueries({ queryKey: ['recent'] });
  };

  const handleUploaded = useCallback((count) => {
    queryClient.invalidateQueries({ queryKey: ['library'] });
    queryClient.invalidateQueries({ queryKey: ['sources'] });
    queryClient.invalidateQueries({ queryKey: ['recent'] });
  }, [queryClient]);

  const openUploadDialog = useCallback(() => {
    setUploadDialogKey((k) => k + 1);
  }, []);

  const toggleSelectComic = useCallback((comicId) => {
    setSelectedComicIds(prev => (
      prev.includes(comicId)
        ? prev.filter(id => id !== comicId)
        : [...prev, comicId]
    ));
  }, []);

  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setSelectedComicIds([]);
  }, []);

  const offloadSelected = useCallback(() => {
    if (selectedComicIds.length === 0) return;
    Modal.confirm({
      title: `Offload ${selectedComicIds.length} selected comic${selectedComicIds.length > 1 ? 's' : ''}?`,
      content: 'This removes selected comics from your library. Files on disk are not deleted.',
      okText: 'Offload Selected',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        const results = await Promise.allSettled(
          selectedComicIds.map(id => libraryApi.deleteComic(id))
        );
        const failed = results.filter(r => r.status === 'rejected').length;
        const removed = results.length - failed;

        if (removed > 0) {
          notifApi.success({ message: `Offloaded ${removed} comic${removed > 1 ? 's' : ''}` });
        }
        if (failed > 0) {
          notifApi.error({ message: `Failed to offload ${failed} comic${failed > 1 ? 's' : ''}` });
        }

        queryClient.invalidateQueries({ queryKey: ['library'] });
        queryClient.invalidateQueries({ queryKey: ['recent'] });
        setSelectedComicIds([]);
      },
    });
  }, [selectedComicIds, notifApi, queryClient]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const comics = allData?.comics || [];

  // Comics that are fully ready (page_count > 0)
  const readyComics = useMemo(() => comics.filter(c => c.page_count > 0), [comics]);

  // Comics that arrived via source scan and are still indexing
  const scanIndexing = useMemo(() =>
    comics.filter(c => c.page_count === 0 && !uploadQueue.some(q => q.comicId === c.id)),
    [comics, uploadQueue]
  );

  const continueReading = useMemo(() =>
    (recentComics || []).filter(c => (c.current_page || 0) > 0 && c.current_page < c.total_pages - 1),
    [recentComics]);

  const recentlyAdded = useMemo(() =>
    [...readyComics].sort((a, b) => (b.date_added || 0) - (a.date_added || 0)).slice(0, 20),
    [readyComics]);

  const favorites = useMemo(() => readyComics.filter(c => c.is_favorite), [readyComics]);

  const duplicateComicIds = useMemo(() => {
    const map = new Map();
    readyComics.forEach((c) => {
      const key = normalizeTitleKey(c.title);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c.id);
    });
    return Array.from(map.values()).filter(ids => ids.length > 1).flat();
  }, [readyComics]);

  const series = useMemo(() => {
    const map = {};
    readyComics.forEach(c => {
      if (c.series) {
        if (!map[c.series]) map[c.series] = [];
        map[c.series].push(c);
      }
    });
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [readyComics]);

  const heroComic = continueReading[0] || recentlyAdded[0] || null;

  useEffect(() => {
    const valid = new Set(readyComics.map(c => c.id));
    setSelectedComicIds(prev => prev.filter(id => valid.has(id)));
  }, [readyComics]);

  const cardProps = (comic) => ({
    comic,
    onRead: () => {
      if (bulkMode) {
        toggleSelectComic(comic.id);
        return;
      }
      navigate(`/read/${comic.id}`);
    },
    onFavorite: () => favMutation.mutate(comic.id),
    onOffload: (c) => {
      Modal.confirm({
        title: `Offload "${c.title}"?`,
        content: 'This removes the comic from your library. The file on disk is not deleted.',
        okText: 'Offload',
        okButtonProps: { danger: true },
        cancelText: 'Cancel',
        onOk: () => deleteMutation.mutate(c.id),
      });
    },
    bulkMode,
    selected: selectedComicIds.includes(comic.id),
    onToggleSelect: toggleSelectComic,
  });

  const selectAllVisible = useCallback(() => {
    const ids = readyComics.map(c => c.id);
    setSelectedComicIds(ids);
  }, [readyComics]);

  const selectDuplicatesOnly = useCallback(() => {
    setSelectedComicIds(duplicateComicIds);
  }, [duplicateComicIds]);

  // ── Processing items = uploadQueue + scan-indexing comics ────────────────
  const allProcessing = [
    ...uploadQueue.map(q => ({
      ...q, isUploadQueue: true,
    })),
    ...scanIndexing.map(c => ({
      localId: c.id,
      title: c.title,
      status: 'indexing',
      percent: 0,
      comicId: c.id,
      thumbnailUrl: c.cover_path || readerApi.getCoverUrl(c.id),
    })),
  ];

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.skeletonHero} />
        <div className={styles.toolbar} style={{ opacity: 0 }} />
        <SkeletonCarousel title count={8} />
        <SkeletonCarousel title count={8} />
      </div>
    );
  }

  // ── Search results view ──────────────────────────────────────────────────
  if (urlSearch) {
    return (
      <div className={styles.page}>
        {ctxHolder}
        <SearchResults
          comics={readyComics}
          query={urlSearch}
          onRead={id => navigate(`/read/${id}`)}
          onFavorite={id => favMutation.mutate(id)}
          onClear={() => setSearchParams({})}
        />
      </div>
    );
  }

  // ── Empty library ────────────────────────────────────────────────────────
  const isEmpty = comics.length === 0;
  if (isEmpty) {
    return (
      <div className={styles.page}>
        {ctxHolder}
        <div className={styles.emptyScreen}>
          <div className={styles.emptyInner}>
            <div className={styles.emptyIcon}>📚</div>
            <h2 className={`${styles.emptyTitle} ${styles.displayType}`}>Your library is empty</h2>
            <p className={styles.emptySubtitle}>
              Upload comics directly or add a local folder source.
            </p>
            <div className={styles.emptyActions}>
              <Button type="primary" size="large" icon={<UploadOutlined />}
                onClick={openUploadDialog}
                style={{ background: '#e50914', borderColor: '#e50914' }}>
                Upload Comics
              </Button>
              <Button size="large" icon={<PlusCircleOutlined />}
                onClick={() => navigate('/sources')}>
                Add Source Folder
              </Button>
            </div>
            <div className={styles.emptyDropZone}>
              <DropZone compact onUploaded={handleUploaded} />
            </div>
          </div>
        </div>
        <DropZone
          hidden
          onUploaded={handleUploaded}
          triggerFileDialogKey={uploadDialogKey}
        />
      </div>
    );
  }

  // ── Main library view ────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {ctxHolder}

      {/* Hero */}
      {heroComic && (
        <AnimatedHero>
          <HeroSection
            comic={heroComic}
            onRead={() => navigate(`/read/${heroComic.id}`)}
            onFavorite={() => favMutation.mutate(heroComic.id)}
          />
        </AnimatedHero>
      )}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <Tooltip title="Upload comics">
          <Button className={styles.iconOnlyBtn} icon={<UploadOutlined />} onClick={openUploadDialog} aria-label="Upload comics" />
        </Tooltip>
        {!bulkMode && (
          <Tooltip title="Bulk offload mode">
            <Button className={styles.iconOnlyBtn} icon={<DeleteOutlined />} danger onClick={() => setBulkMode(true)} aria-label="Bulk offload mode" />
          </Tooltip>
        )}
        {bulkMode && (
          <Tooltip title={`Select all (${readyComics.length})`}>
            <Button className={styles.iconOnlyBtn} icon={<CheckSquareOutlined />} onClick={selectAllVisible} disabled={readyComics.length === 0} aria-label="Select all comics" />
          </Tooltip>
        )}
        {bulkMode && (
          <Tooltip title={`Select duplicates only (${duplicateComicIds.length})`}>
            <Button className={styles.iconOnlyBtn} icon={<CopyOutlined />} onClick={selectDuplicatesOnly} disabled={duplicateComicIds.length === 0} aria-label="Select duplicate comics" />
          </Tooltip>
        )}
        {bulkMode && (
          <Tooltip title={`Offload selected (${selectedComicIds.length})`}>
            <Button
              className={styles.iconOnlyBtn}
              icon={<DeleteOutlined />}
              danger
              disabled={selectedComicIds.length === 0}
              onClick={offloadSelected}
              aria-label="Offload selected comics"
            />
          </Tooltip>
        )}
        {bulkMode && (
          <Tooltip title="Exit bulk mode">
            <Button className={styles.iconOnlyBtn} icon={<CloseOutlined />} onClick={exitBulkMode} aria-label="Exit bulk mode" />
          </Tooltip>
        )}
        {(sources || []).length > 0 && (
          <Tooltip title="Scan all sources">
            <Button className={styles.iconOnlyBtn} icon={<ReloadOutlined spin={!!scanningId} />} loading={!!scanningId}
              onClick={handleScanAll} aria-label="Scan all sources" />
          </Tooltip>
        )}
        <Tooltip title="Go to sources">
          <Button className={styles.iconOnlyBtn} icon={<PlusCircleOutlined />} onClick={() => navigate('/sources')} aria-label="Go to sources" />
        </Tooltip>
      </div>

      {/* ── PROCESSING ROW — shown whenever anything is uploading/indexing ── */}
      {allProcessing.length > 0 && (
        <ComicCarousel title="⏳ In Progress">
          {allProcessing.map(item => (
            <ProcessingCard key={item.localId} item={item} />
          ))}
        </ComicCarousel>
      )}

      {/* ── LIBRARY ROWS ──────────────────────────────────────────────────── */}
      {continueReading.length > 0 && (
        <ComicCarousel title="Continue Reading">
          {continueReading.map(c => <ComicCard key={c.id} {...cardProps(c)} />)}
        </ComicCarousel>
      )}

      {recentlyAdded.length > 0 && (
        <ComicCarousel title="Recently Added">
          {recentlyAdded.map(c => <ComicCard key={c.id} {...cardProps(c)} />)}
        </ComicCarousel>
      )}

      {favorites.length > 0 && (
        <ComicCarousel title="❤ Favorites">
          {favorites.map(c => <ComicCard key={c.id} {...cardProps(c)} />)}
        </ComicCarousel>
      )}

      {series.map(([seriesName, seriesComics]) => (
        <ComicCarousel key={seriesName} title={seriesName}>
          {seriesComics.map(c => <ComicCard key={c.id} {...cardProps(c)} />)}
        </ComicCarousel>
      ))}

      {/* All comics if no series exist */}
      {series.length === 0 && continueReading.length === 0 && readyComics.length > 0 && (
        <ComicCarousel title="All Comics">
          {readyComics.map(c => <ComicCard key={c.id} {...cardProps(c)} />)}
        </ComicCarousel>
      )}

      <div style={{ height: 48 }} />

      <DropZone
        hidden
        onUploaded={handleUploaded}
        triggerFileDialogKey={uploadDialogKey}
      />
    </div>
  );
}
