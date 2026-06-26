import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Upload queue (NOT persisted — resets on page reload) ──────────────────
// Tracks files being uploaded or indexed, so ghost cards appear in the
// library the instant an upload starts rather than after it finishes.
const uploadQueueSlice = (set) => ({
  uploadQueue: [],
  // { localId, title, size, status: 'uploading'|'indexing'|'done', percent, comicId }

  queueAddUpload: (item) =>
    set(s => ({ uploadQueue: [...s.uploadQueue, item] })),

  queueUpdateUpload: (localId, patch) =>
    set(s => ({
      uploadQueue: s.uploadQueue.map(i => i.localId === localId ? { ...i, ...patch } : i),
    })),

  queueRemoveUpload: (localId) =>
    set(s => ({ uploadQueue: s.uploadQueue.filter(i => i.localId !== localId) })),

  queueClear: () => set({ uploadQueue: [] }),
});

export const useAppStore = create(
  persist(
    (set, get) => ({
      // ── Upload queue (not persisted) ──────────────────
      ...uploadQueueSlice(set),
      // Reading settings
      settings: {
        readingDirection: 'ltr', // ltr | rtl
        readingMode: 'single',   // single | double | scroll
        zoomMode: 'smart',       // smart | manual | fit-width | fit-height
        backgroundColor: '#000',
        showPageNumber: true,
        autoProgress: false,
        transitionAnimation: 'slide', // slide | fade | none
      },

      updateSettings: (patch) =>
        set(s => ({ settings: { ...s.settings, ...patch } })),

      // Active reader state (not persisted)
      readerState: {
        comicId: null,
        currentPage: 0,
        totalPages: 0,
        zoom: 1,
        panX: 0,
        panY: 0,
        zoomedPanel: null, // { x, y, width, height } normalized
        isFullscreen: false,
        showControls: true,
        showThumbnails: false,
      },

      setReaderState: (patch) =>
        set(s => ({ readerState: { ...s.readerState, ...patch } })),

      resetReader: () =>
        set(s => ({
          readerState: {
            ...s.readerState,
            currentPage: 0,
            zoom: 1,
            panX: 0,
            panY: 0,
            zoomedPanel: null,
            showControls: true,
          },
        })),
    }),
    {
      name: 'comic-reader-settings',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
