import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAppStore = create(
  persist(
    (set, get) => ({
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
