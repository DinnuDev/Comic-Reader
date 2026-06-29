import React, { useState, useEffect, useRef } from 'react';
import { Tooltip } from 'antd';
import {
  ReadOutlined, BookOutlined, DatabaseOutlined,
  SettingOutlined, SearchOutlined, CloseOutlined, LogoutOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../../services/api';
import styles from './AppLayout.module.css';

const NAV_LINKS = [
  { path: '/', label: 'Library', icon: <BookOutlined /> },
  { path: '/sources', label: 'Sources', icon: <DatabaseOutlined /> },
  { path: '/settings', label: 'Settings', icon: <SettingOutlined /> },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');
  const searchRef = useRef(null);
  const contentRef = useRef(null);

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: async () => {
      queryClient.setQueryData(['auth-user'], null);
      queryClient.removeQueries({ queryKey: ['auth-user'] });
      navigate('/auth', { replace: true });
    },
    onError: () => {
      // Force local logout even if network/logout endpoint fails.
      queryClient.setQueryData(['auth-user'], null);
      queryClient.removeQueries({ queryKey: ['auth-user'] });
      navigate('/auth', { replace: true });
    },
  });

  // Make nav opaque after scrolling down
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 20);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const openSearch = () => {
    setSearchOpen(true);
    setTimeout(() => searchRef.current?.focus(), 80);
  };

  const closeSearch = () => { setSearchOpen(false); setSearchVal(''); };

  const handleSearch = (v) => {
    if (!v.trim()) return;
    navigate(`/?search=${encodeURIComponent(v.trim())}`);
    closeSearch();
  };

  const handleKeyDown = (e) => { if (e.key === 'Escape') closeSearch(); };

  return (
    <div className={styles.shell}>
      {/* ── TOP NAV ──────────────────────────────────── */}
      <nav className={`${styles.nav} ${scrolled ? styles.navSolid : ''}`}>
        {/* Logo */}
        <button className={styles.logo} onClick={() => navigate('/')}>
          <ReadOutlined className={styles.logoIcon} />
          <span className={styles.logoText}>COMIX</span>
        </button>

        {/* Nav links */}
        <ul className={styles.navLinks}>
          {NAV_LINKS.map(({ path, label }) => (
            <li key={path}>
              <button
                className={`${styles.navLink} ${location.pathname === path ? styles.navActive : ''}`}
                onClick={() => navigate(path)}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>

        {/* Right actions */}
        <div className={styles.navRight}>
          {searchOpen ? (
            <div className={styles.searchBar}>
              <SearchOutlined className={styles.searchIcon} />
              <input
                ref={searchRef}
                className={styles.searchInput}
                placeholder="Search comics, series…"
                value={searchVal}
                onChange={e => setSearchVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(searchVal); if (e.key === 'Escape') closeSearch(); }}
              />
              <button className={styles.searchClose} onClick={closeSearch}>
                <CloseOutlined />
              </button>
            </div>
          ) : (
            <>
              <button className={styles.iconBtn} onClick={openSearch} aria-label="Search">
                <SearchOutlined />
              </button>
              <Tooltip title="Logout">
                <button
                  className={styles.iconBtn}
                  onClick={() => logoutMutation.mutate()}
                  aria-label="Logout"
                  disabled={logoutMutation.isPending}
                >
                  <LogoutOutlined />
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </nav>

      {/* ── CONTENT ──────────────────────────────────── */}
      <main ref={contentRef} className={styles.content}>
        <Outlet context={{ scrolledRef: contentRef }} />
      </main>
    </div>
  );
}
