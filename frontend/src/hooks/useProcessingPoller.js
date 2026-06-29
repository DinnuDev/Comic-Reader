import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { uploadApi, readerApi } from '../services/api';
import { useAppStore } from '../store';

/**
 * Polls `/api/upload/status/:id` for every comic in the uploadQueue that
 * has status === 'indexing'.  When the backend reports page_count > 0,
 * marks it 'done', waits 800 ms for the user to see the transition, then
 * removes it and invalidates the library query so the real card appears.
 *
 * Also polls the library for any comics with page_count === 0 that were
 * added via source scan (not in the uploadQueue), and invalidates the
 * library query when they finish indexing.
 */
export function useProcessingPoller(libraryComics = []) {
  const queryClient = useQueryClient();
  const { uploadQueue, queueUpdateUpload, queueRemoveUpload } = useAppStore();
  const pollingRef = useRef(false);
  const timerRef = useRef(null);

  // IDs of comics being indexed that came from the BACKEND scan
  // (not uploaded by the user — just appeared with page_count = 0)
  const scanProcessing = (libraryComics || []).filter(
    c => c.page_count === 0 && !uploadQueue.some(q => q.comicId === c.id)
  );

  const indexingQueue = uploadQueue.filter(i => i.status === 'indexing');
  const hasWork = indexingQueue.length > 0 || scanProcessing.length > 0;

  const poll = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;

    try {
      // Poll upload-queue items that are indexing
      for (const item of indexingQueue) {
        if (!item.comicId) continue;
        try {
          const status = await uploadApi.getStatus(item.comicId);
          if (!status.processing) {
            queueUpdateUpload(item.localId, {
              status: 'done',
              thumbnailUrl: `${readerApi.getCoverUrl(item.comicId)}?t=${Date.now()}`,
            });
            setTimeout(() => {
              queueRemoveUpload(item.localId);
              queryClient.invalidateQueries({ queryKey: ['library'] });
              queryClient.invalidateQueries({ queryKey: ['recent'] });
            }, 900);
          }
        } catch { /* ignore per-item errors */ }
      }

      // Poll scan-processing comics
      if (scanProcessing.length > 0) {
        try {
          const statuses = await Promise.all(
            scanProcessing.map(c => uploadApi.getStatus(c.id).catch(() => null))
          );
          const anyDone = statuses.some(s => s && !s.processing && s.page_count > 0);
          if (anyDone) {
            queryClient.invalidateQueries({ queryKey: ['library'] });
            queryClient.invalidateQueries({ queryKey: ['recent'] });
          }
        } catch { /* ignore */ }
      }
    } finally {
      pollingRef.current = false;
    }
  }, [indexingQueue, scanProcessing, queueUpdateUpload, queueRemoveUpload, queryClient]);

  useEffect(() => {
    if (!hasWork) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(poll, 2500);
    return () => clearInterval(timerRef.current);
  }, [hasWork, poll]);
}
