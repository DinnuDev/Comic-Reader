import React, { useState } from 'react';
import { Switch, Select, Typography, Tag, Divider } from 'antd';
import {
  ReadOutlined, BgColorsOutlined, KeyOutlined,
  InfoCircleOutlined, SettingOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../store';
import styles from './SettingsPage.module.css';

const { Text } = Typography;

// ── Setting row ───────────────────────────────────────────────────────────
function Row({ label, hint, children, fullWidth }) {
  return (
    <div className={`${styles.row} ${fullWidth ? styles.rowFull : ''}`}>
      <div className={styles.rowLeft}>
        <div className={styles.rowLabel}>{label}</div>
        {hint && <div className={styles.rowHint}>{hint}</div>}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

// ── Direction picker ──────────────────────────────────────────────────────
function DirPicker({ value, onChange }) {
  return (
    <div className={styles.dirPicker}>
      {[
        { v: 'ltr', arrow: '→', label: 'Left → Right' },
        { v: 'rtl', arrow: '←', label: 'Right → Left', sub: 'Manga' },
      ].map(o => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`${styles.dirBtn} ${value === o.v ? styles.dirActive : ''}`}>
          <span className={styles.dirArrow}>{o.arrow}</span>
          <span className={styles.dirLabel}>{o.label}</span>
          {o.sub && <span className={styles.dirSub}>{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Colour swatches ───────────────────────────────────────────────────────
const BG_OPTS = [
  { v: '#000000', label: 'Black',  border: '#333' },
  { v: '#1a1a1a', label: 'Dark',   border: '#444' },
  { v: '#ffffff', label: 'White',  border: '#ccc' },
  { v: '#f5f0e8', label: 'Sepia',  border: '#c8b89a' },
];

function Swatches({ value, onChange }) {
  return (
    <div className={styles.swatches}>
      {BG_OPTS.map(o => (
        <div key={o.v} className={styles.swatchWrap}>
          <button
            className={`${styles.swatch} ${value === o.v ? styles.swatchOn : ''}`}
            style={{ background: o.v, borderColor: value === o.v ? '#e50914' : o.border }}
            onClick={() => onChange(o.v)}
            title={o.label}
          />
          <span className={styles.swatchLabel}>{o.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Keyboard shortcut table ───────────────────────────────────────────────
const SHORTCUTS = [
  ['Tap left / right 20%', 'Previous / Next page'],
  ['Tap center', 'Smart panel zoom'],
  ['Double tap', 'Toggle 2× zoom'],
  ['Swipe', 'Turn pages'],
  ['Pinch', 'Free zoom 1–5×'],
  ['Drag (zoomed)', 'Pan the page'],
  ['← →', 'Navigate pages'],
  ['B', 'Bookmark current page'],
  ['G', 'Go to page…'],
  ['F', 'Toggle fullscreen'],
  ['Esc', 'Exit reader'],
];

// ── Stack badges ──────────────────────────────────────────────────────────
const STACK = [
  { l: 'React 18',     c: '#61dafb', bg: 'rgba(97,218,251,0.1)'  },
  { l: 'Vite 5',       c: '#a259ff', bg: 'rgba(162,89,255,0.1)'  },
  { l: 'Ant Design 5', c: '#1677ff', bg: 'rgba(22,119,255,0.1)'  },
  { l: 'Node.js',      c: '#68a063', bg: 'rgba(104,160,99,0.1)'  },
  { l: 'SQLite',       c: '#4a9eff', bg: 'rgba(74,158,255,0.1)'  },
  { l: 'unzipper',     c: '#f0a500', bg: 'rgba(240,165,0,0.1)'   },
  { l: 'Google PKCE',  c: '#e50914', bg: 'rgba(229,9,20,0.1)'    },
];

// ── Section definitions ───────────────────────────────────────────────────
const NAV = [
  { id: 'reading',   icon: <ReadOutlined />,      label: 'Reading'   },
  { id: 'display',   icon: <BgColorsOutlined />,   label: 'Display'   },
  { id: 'shortcuts', icon: <KeyOutlined />,         label: 'Shortcuts' },
  { id: 'about',     icon: <InfoCircleOutlined />,  label: 'About'     },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { settings, updateSettings } = useAppStore();
  const [active, setActive] = useState('reading');

  return (
    <div className={styles.page}>
      {/* ── Left sidebar ──────────────────────────────────────────── */}
      <nav className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div className={styles.sidebarLogoMark}>
            <svg viewBox="0 0 28 28" width="28" height="28">
              <rect width="28" height="28" rx="6" fill="#0a0a0a"/>
              <rect x="3" y="3" width="10" height="13" rx="1.5" fill="#e50914"/>
              <rect x="15" y="3" width="10" height="6" rx="1.5" fill="#e50914" opacity="0.8"/>
              <rect x="15" y="11" width="10" height="5" rx="1.5" fill="#e50914" opacity="0.5"/>
              <rect x="3" y="18" width="6" height="7" rx="1.5" fill="#e50914" opacity="0.65"/>
              <rect x="11" y="18" width="14" height="7" rx="1.5" fill="#e50914" opacity="0.9"/>
            </svg>
            <span className={styles.logoText}>Settings</span>
          </div>
        </div>

        {NAV.map(n => (
          <button
            key={n.id}
            className={`${styles.navItem} ${active === n.id ? styles.navActive : ''}`}
            onClick={() => setActive(n.id)}
          >
            <span className={styles.navIcon}>{n.icon}</span>
            <span className={styles.navLabel}>{n.label}</span>
            {active === n.id && <span className={styles.navIndicator} />}
          </button>
        ))}
      </nav>

      {/* ── Right content panel ───────────────────────────────────── */}
      <main className={styles.content}>

        {/* READING ─────────────────────────────────────────────── */}
        {active === 'reading' && (
          <Panel title="Reading" subtitle="Page layout and navigation behaviour">
            <Row label="Reading Direction" hint="Affects swipe direction and page-turn arrow sides">
              <DirPicker
                value={settings.readingDirection}
                onChange={v => updateSettings({ readingDirection: v })}
              />
            </Row>
            <Row label="Default Mode" hint="How pages are displayed when you open a comic">
              <Select
                value={settings.readingMode}
                onChange={v => updateSettings({ readingMode: v })}
                className={styles.sel}
                options={[
                  { value: 'single', label: '⬜  Single Page' },
                  { value: 'double', label: '⬛⬜  Double Page Spread' },
                  { value: 'scroll', label: '↕  Vertical Scroll (Webtoon)' },
                ]}
              />
            </Row>
            <Row label="Page Transition" hint="Animation shown when turning pages">
              <Select
                value={settings.transitionAnimation}
                onChange={v => updateSettings({ transitionAnimation: v })}
                className={styles.sel}
                options={[
                  { value: 'slide', label: '→  Slide' },
                  { value: 'fade',  label: '◌  Fade' },
                  { value: 'none',  label: '×  Instant' },
                ]}
              />
            </Row>
          </Panel>
        )}

        {/* DISPLAY ─────────────────────────────────────────────── */}
        {active === 'display' && (
          <Panel title="Display" subtitle="Zoom behaviour and visual appearance">
            <Row label="Zoom Mode" hint="What happens when you tap the centre of a page">
              <Select
                value={settings.zoomMode}
                onChange={v => updateSettings({ zoomMode: v })}
                className={styles.sel}
                options={[
                  { value: 'smart',      label: '🎯  Smart Panel Zoom' },
                  { value: 'manual',     label: '🔍  Manual Zoom' },
                  { value: 'fit-width',  label: '↔  Fit Width' },
                  { value: 'fit-height', label: '↕  Fit Height' },
                ]}
              />
            </Row>
            <Row label="Reader Background" hint="Colour shown behind pages" fullWidth>
              <Swatches
                value={settings.backgroundColor}
                onChange={v => updateSettings({ backgroundColor: v })}
              />
            </Row>
            <Row label="Page Numbers" hint="Always show the current page / total at the bottom">
              <Switch
                checked={settings.showPageNumber}
                onChange={v => updateSettings({ showPageNumber: v })}
              />
            </Row>
          </Panel>
        )}

        {/* SHORTCUTS ───────────────────────────────────────────── */}
        {active === 'shortcuts' && (
          <Panel title="Gestures & Shortcuts" subtitle="All controls available inside the reader">
            <div className={styles.kbdGrid}>
              {SHORTCUTS.map(([key, action]) => (
                <div key={key} className={styles.kbdRow}>
                  <kbd className={styles.kbd}>{key}</kbd>
                  <span className={styles.kbdAction}>{action}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* ABOUT ───────────────────────────────────────────────── */}
        {active === 'about' && (
          <Panel title="About COMIX" subtitle="Personal comic reader">
            <div className={styles.aboutLayout}>
              <div className={styles.aboutLogo}>
                <svg viewBox="0 0 56 56" width="56" height="56">
                  <rect width="56" height="56" rx="12" fill="#0a0a0a"/>
                  <rect x="4" y="4" width="22" height="30" rx="3" fill="#e50914"/>
                  <rect x="30" y="4" width="22" height="14" rx="3" fill="#e50914" opacity="0.8"/>
                  <rect x="30" y="21" width="22" height="13" rx="3" fill="#e50914" opacity="0.5"/>
                  <rect x="4" y="38" width="13" height="14" rx="3" fill="#e50914" opacity="0.65"/>
                  <rect x="21" y="38" width="31" height="14" rx="3" fill="#e50914" opacity="0.9"/>
                </svg>
                <div>
                  <div className={styles.aboutName}>COMIX</div>
                  <div className={styles.aboutVer}>v1.0.0 — Personal Build</div>
                </div>
              </div>
              <p className={styles.aboutDesc}>
                Read CBZ, CBR, PDF and image folders from your local drive or Google Drive.
                Google Play Books–style smart panel zoom, Netflix-style library,
                up to 5 GB per file, PKCE-based Google auth.
              </p>
              <Divider style={{ borderColor: 'rgba(255,255,255,0.07)', margin: '12px 0' }} />
              <div className={styles.stackWrap}>
                {STACK.map(s => (
                  <span key={s.l} className={styles.badge}
                    style={{ color: s.c, background: s.bg, borderColor: `${s.c}33` }}>
                    {s.l}
                  </span>
                ))}
              </div>
            </div>
          </Panel>
        )}

      </main>
    </div>
  );
}

// ── Panel wrapper ─────────────────────────────────────────────────────────
function Panel({ title, subtitle, children }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {subtitle && <p className={styles.panelSub}>{subtitle}</p>}
      </div>
      <div className={styles.panelBody}>{children}</div>
    </div>
  );
}
