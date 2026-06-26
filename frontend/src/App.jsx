import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import AppLayout from './components/Layout/AppLayout';
import LibraryPage from './pages/LibraryPage';
import ReaderPage from './pages/ReaderPage';
import SourcesPage from './pages/SourcesPage';
import SettingsPage from './pages/SettingsPage';

const antdTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#e94560',
    colorBgBase: '#0d0d0d',
    colorBgContainer: '#16213e',
    colorBgElevated: '#1a1a2e',
    borderRadius: 8,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  components: {
    Layout: { bodyBg: '#0d0d0d', headerBg: '#1a1a2e', siderBg: '#1a1a2e' },
    Menu: { darkItemBg: '#1a1a2e', darkSubMenuItemBg: '#16213e' },
    Card: { colorBgContainer: '#16213e' },
  },
};

export default function App() {
  return (
    <ConfigProvider theme={antdTheme}>
      <BrowserRouter>
        <Routes>
          {/* Reader is full-screen, no layout */}
          <Route path="/read/:comicId" element={<ReaderPage />} />
          {/* All other pages use the app layout */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/sources" element={<SourcesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
