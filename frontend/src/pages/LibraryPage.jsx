import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Spin, notification, Drawer, Button, Typography,
} from 'antd';
import {
  UploadOutlined, PlusCircleOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { libraryApi, sourcesApi } from '../services/api';
import ComicCard from '../components/Library/ComicCard';
import HeroSection from '../components/Library/HeroSection';
import ComicCarousel from '../components/Library/ComicCarousel';
import { SkeletonCarousel } from '../components/Library/SkeletonCard';
import DropZone from '../components/Upload/DropZone';
import SearchResults from '../components/Library/SearchResults';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import styles from './LibraryPage.module.css';

const { Text } = Typography;

/** Fade-in wrapper for the hero when it first mounts */
function AnimatedHero({ children }) {
  const [heroRef, heroVisible] = useScrollAnimation({ threshold: 0.01, rootMargin: '0px' });
  return (
    <div
      ref={heroRef}
      style={{
        opacity: heroVisible ? 1 : 0,
        transform: heroVisible ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}
    >
      {children}
    </div>
  );
}

export default function LibraryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [scanningId, setScanningId] = useState(null);
  const [notifApi, ctxHolder] = notification.useNotification();

  // Pull search from URL (set by top-nav search)
  const urlSearch = searchParams.get('search') || '';

  // Google Drive OAuth callback
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

  const { data: allData, isLoading } = useQuery({
    queryKey: ['library', urlSearch],
    queryFn: () => libraryApi.getAll({ search: urlSearch || undefined, sort: 'date_added', order: 'desc', limit: 200 }),
  });

  const { data: recentComics } = useQuery({
    queryKey: ['recent'],
    queryFn: libraryApi.getRecent,
  });

  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: sourcesApi.getAll,
  });

  const favMutation = useMutation({
    mutationFn: libraryApi.toggleFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['recent'] });
    },
  });

  const handleScanAll = async () => {
    const srcs = sources || [];
    for (const s of srcs) {
      setScanningId(s.id);
      try {
        await libraryApi.scanSource(s.id);
      } catch {}
    }
    setScanningId(null);
    queryClient.invalidateQueries({ queryKey: ['library'] });
    queryClient.invalidateQueries({ queryKey: ['recent'] });
  };

  const handleUploaded = useCallback((count) => {
    notification.success({ message: `${count} comic${count > 1 ? 's' : ''} added!` });
    queryClient.invalidateQueries({ queryKey: ['library'] });
    queryClient.invalidateQueries({ queryKey: ['sources'] });
    queryClient.invalidateQueries({ queryKey: ['recent'] });
    setShowUpload(false);
  }, [queryClient]);

  const comics = allData?.comics || [];

  // Derived lists for carousels
  const continueReading = useMemo(() =>
    (recentComics || []).filter(c => (c.current_page || 0) > 0 && c.current_page < c.total_pages - 1),
    [recentComics]);

  const recentlyAdded = useMemo(() =>
    [...comics].sort((a, b) => (b.date_added || 0) - (a.date_added || 0)).slice(0, 20),
    [comics]);

  const favorites = useMemo(() =>
    comics.filter(c => c.is_favorite),
    [comics]);

  const series = useMemo(() => {
    const map = {};
    comics.forEach(c => {
      if (c.series) {
        if (!map[c.series]) map[c.series] = [];
        map[c.series].push(c);
      }
    });
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [comics]);

  // Hero: use last-read or first comic
  const heroComic = continueReading[0] || recentlyAdded[0] || null;

  const cardProps = (comic) => ({
    comic,
    onRead: () => navigate(`/read/${comic.id}`),
    onFavorite: () => favMutation.mutate(comic.id),
  });

  if (isLoading) {
    return (
      <div className={styles.page}>
        {/* Skeleton hero */}
        <div className={styles.skeletonHero} />
        <div className={styles.toolbar} style={{ opacity: 0 }} />
        <SkeletonCarousel title count={8} />
        <SkeletonCarousel title count={8} />
        <SkeletonCarousel title count={8} />
      </div>
    );
  }

  // Search results view
  if (urlSearch) {
    return (
      <div className={styles.page}>
        {ctxHolder}
        <SearchResults
          comics={comics}
          query={urlSearch}
          onRead={id => navigate(`/read/${id}`)}
          onFavorite={id => favMutation.mutate(id)}
          onClear={() => setSearchParams({})}
        />
      </div>
    );
  }

  // Empty library
  if (comics.length === 0) {
    return (
      <div className={styles.page}>
        {ctxHolder}
        <div className={styles.emptyScreen}>
          <div className={styles.emptyInner}>
            <div className={styles.emptyIcon}>📚</div>
            <h2 className={styles.emptyTitle}>Your library is empty</h2>
            <p className={styles.emptySubtitle}>Upload comics or add a source folder to get started.</p>
            <div className={styles.emptyActions}>
              <Button type="primary" size="large" icon={<UploadOutlined />} onClick={() => setShowUpload(true)}
                style={{ background: '#e50914', borderColor: '#e50914' }}>
                Upload Comics
              </Button>
              <Button size="large" icon={<PlusCircleOutlined />} onClick={() => navigate('/sources')}>
                Add Source
              </Button>
            </div>
            <div className={styles.emptyDropZone}>
              <DropZone compact onUploaded={handleUploaded} />
            </div>
          </div>
        </div>
        <Drawer title="Upload Comics" placement="right" width={480} open={showUpload} onClose={() => setShowUpload(false)}>
          <DropZone onUploaded={handleUploaded} />
        </Drawer>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {ctxHolder}

      {/* ── HERO ──────────────────────────────────── */}
      {heroComic && (
        <AnimatedHero>
          <HeroSection
            comic={heroComic}
            onRead={() => navigate(`/read/${heroComic.id}`)}
            onFavorite={() => favMutation.mutate(heroComic.id)}
          />
        </AnimatedHero>
      )}

      {/* ── FLOATING TOOLBAR ──────────────────────── */}
      <div className={styles.toolbar}>
        <Button icon={<UploadOutlined />} onClick={() => setShowUpload(true)}>Upload</Button>
        {(sources || []).length > 0 && (
          <Button
            icon={<ReloadOutlined spin={!!scanningId} />}
            loading={!!scanningId}
            onClick={handleScanAll}
          >
            Scan All
          </Button>
        )}
        <Button icon={<PlusCircleOutlined />} onClick={() => navigate('/sources')}>Sources</Button>
      </div>

      {/* ── CAROUSELS ─────────────────────────────── */}
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

      {/* All comics if no series */}
      {series.length === 0 && continueReading.length === 0 && (
        <ComicCarousel title="All Comics">
          {comics.map(c => <ComicCard key={c.id} {...cardProps(c)} />)}
        </ComicCarousel>
      )}

      {/* Bottom padding */}
      <div style={{ height: 48 }} />

      {/* Upload drawer */}
      <Drawer title="Upload Comics" placement="right" width={480} open={showUpload} onClose={() => setShowUpload(false)}>
        <DropZone onUploaded={handleUploaded} />
      </Drawer>
    </div>
  );
}
