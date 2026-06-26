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
    colorPrimary: '#e50914',
    colorBgBase: '#0a0a0a',
    colorBgContainer: '#141414',
    colorBgElevated: '#181818',
    colorText: '#e5e5e5',
    colorTextSecondary: 'rgba(255,255,255,0.55)',
    borderRadius: 4,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  components: {
    Layout: { bodyBg: '#0a0a0a', headerBg: '#0a0a0a', siderBg: '#0a0a0a' },
    Menu: { darkItemBg: 'transparent', darkSubMenuItemBg: 'transparent' },
    Card: { colorBgContainer: '#141414' },
    Drawer: { colorBgElevated: '#141414' },
    Modal: { contentBg: '#181818', headerBg: '#181818' },
    Button: { colorPrimary: '#e50914', colorPrimaryHover: '#f40612' },
    Slider: { colorPrimaryBorder: '#e50914', colorPrimary: '#e50914' },
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
