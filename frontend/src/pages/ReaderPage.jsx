import React, { useEffect, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Spin, notification } from 'antd';
import { readerApi, progressApi } from '../services/api';
import ComicReader from '../components/Reader/ComicReader';
import styles from './ReaderPage.module.css';

export default function ReaderPage() {
  const { comicId } = useParams();
  const navigate = useNavigate();
  // null = not yet determined; number = resolved start page
  const [startPage, setStartPage] = useState(null);
  // Track what page we actually resumed from (for banner display)
  const [resumedFromPage, setResumedFromPage] = useState(null);

  const { data: pageData, isLoading, error } = useQuery({
    queryKey: ['reader-pages', comicId],
    queryFn: () => readerApi.getPages(comicId),
    retry: 1,
  });

  const { data: savedProgress, isSuccess: progressLoaded } = useQuery({
    queryKey: ['progress', comicId],
    queryFn: () => progressApi.get(comicId),
    enabled: !!pageData,
  });

  // Resolve start page as soon as both queries have settled
  useEffect(() => {
    if (!pageData) return;

    if (progressLoaded) {
      const sp = savedProgress?.current_page ?? 0;
      // Only resume mid-comic; if on last page restart from beginning
      const resolved = (sp > 0 && sp < pageData.total - 1) ? sp : 0;
      setStartPage(resolved);
      if (resolved > 0) setResumedFromPage(resolved);
    }
    // If progress query is still loading just wait — the loading screen stays up
  }, [pageData, savedProgress, progressLoaded]);

  // Navigate away on error
  useEffect(() => {
    if (error) {
      notification.error({ message: 'Failed to load comic', placement: 'topRight' });
      navigate('/');
    }
  }, [error, navigate]);

  const handleProgressChange = useCallback(async (currentPage, totalPagesCount) => {
    try {
      await progressApi.save(comicId, {
        current_page: currentPage,
        total_pages: totalPagesCount,
      });
    } catch {
      // Progress save is non-critical
    }
  }, [comicId]);

  // Show loading screen until both page data and start page are resolved
  if (isLoading || startPage === null) {
    return (
      <div className={styles.loading}>
        <Spin size="large" />
        <span className={styles.loadingText}>
          {isLoading ? 'Loading comic…' : 'Restoring your progress…'}
        </span>
      </div>
    );
  }

  return (
    <ComicReader
      comicId={comicId}
      title={pageData.title}
      totalPages={pageData.total}
      initialPage={startPage}
      resumedFromPage={resumedFromPage}
      onProgressChange={handleProgressChange}
      onClose={() => navigate('/')}
    />
  );
}
