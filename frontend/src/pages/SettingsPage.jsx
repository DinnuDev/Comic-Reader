import React, { useState } from 'react';
import { Switch, Select, Typography, Tag } from 'antd';
import {
  ReadOutlined, SwapOutlined, BorderOutlined, BgColorsOutlined,
  ThunderboltOutlined, EyeOutlined, KeyOutlined,
  GithubOutlined, BookOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../store';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import styles from './SettingsPage.module.css';

const { Text } = Typography;

// Animated section wrapper
function Section({ children, delay = 0 }) {
  const [ref, visible] = useScrollAnimation({ threshold: 0.04 });
  return (
    <section ref={ref} className={`${styles.section} ${visible ? styles.visible : styles.hidden}`}
      style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </section>
  );
}

// Individual setting row
function SettingRow({ label, description, children }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>
        <div className={styles.rowTitle}>{label}</div>
        {description && <div className={styles.rowDesc}>{description}</div>}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

// Section header
function SectionHead({ icon, title, subtitle }) {
  return (
    <div className={styles.sectionHead}>
      <span className={styles.sectionIcon}>{icon}</span>
      <div>
        <div className={styles.sectionTitle}>{title}</div>
        {subtitle && <div className={styles.sectionSub}>{subtitle}</div>}
      </div>
    </div>
  );
}

// ── Background colour swatches ─────────────────────────────────────────────
const BG_OPTIONS = [
  { value: '#000000', label: 'Black',    border: '#333' },
  { value: '#1a1a1a', label: 'Dark',     border: '#444' },
  { value: '#ffffff', label: 'White',    border: '#ccc' },
  { value: '#f5f0e8', label: 'Sepia',    border: '#c8b89a' },
];

function ColorSwatch({ value, selected, onChange }) {
  const opt = BG_OPTIONS.find(o => o.value === value);
  return (
    <button
      className={`${styles.swatch} ${selected ? styles.swatchSelected : ''}`}
      style={{ background: value, borderColor: selected ? '#e50914' : opt?.border }}
      onClick={() => onChange(value)}
      aria-label={opt?.label}
      title={opt?.label}
    />
  );
}

// ── Reading direction selector ─────────────────────────────────────────────
function DirectionPicker({ value, onChange }) {
  return (
    <div className={styles.dirPicker}>
      {[
        { v: 'ltr', label: 'Left → Right', icon: '→' },
        { v: 'rtl', label: 'Right → Left', icon: '←', sub: 'Manga' },
      ].map(opt => (
        <button
          key={opt.v}
          className={`${styles.dirBtn} ${value === opt.v ? styles.dirBtnActive : ''}`}
          onClick={() => onChange(opt.v)}
        >
          <span className={styles.dirArrow}>{opt.icon}</span>
          <span className={styles.dirLabel}>{opt.label}</span>
          {opt.sub && <span className={styles.dirSub}>{opt.sub}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Keyboard shortcut grid ─────────────────────────────────────────────────
const SHORTCUTS = [
  { key: '← →', action: 'Previous / Next page' },
  { key: 'Tap center', action: 'Smart panel zoom' },
  { key: 'Double tap', action: 'Toggle 2× zoom' },
  { key: 'Tap edge 20%', action: 'Prev / Next page' },
  { key: 'Swipe', action: 'Turn pages' },
  { key: 'Pinch', action: 'Free zoom 1–5×' },
  { key: 'B', action: 'Toggle bookmark' },
  { key: 'G', action: 'Go to page…' },
  { key: 'F', action: 'Toggle fullscreen' },
  { key: 'Esc', action: 'Exit reader' },
];

const STACK = [
  { label: 'React 18',    color: '#61dafb', bg: 'rgba(97,218,251,0.12)' },
  { label: 'Vite 5',      color: '#a259ff', bg: 'rgba(162,89,255,0.12)' },
  { label: 'Ant Design 5',color: '#1677ff', bg: 'rgba(22,119,255,0.12)' },
  { label: 'Node.js',     color: '#68a063', bg: 'rgba(104,160,99,0.12)' },
  { label: 'Express',     color: '#aaa',    bg: 'rgba(180,180,180,0.1)' },
  { label: 'SQLite',      color: '#4a9eff', bg: 'rgba(74,158,255,0.12)' },
  { label: 'unzipper',    color: '#f0a500', bg: 'rgba(240,165,0,0.12)'  },
  { label: 'Google Drive',color: '#e50914', bg: 'rgba(229,9,20,0.12)'  },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { settings, updateSettings } = useAppStore();

  return (
    <div className={styles.page}>
      {/* Page hero */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <h1 className={styles.heroTitle}>Settings</h1>
          <p className={styles.heroSub}>Customise your reading experience</p>
        </div>
        <div className={styles.heroBadge}>COMIX</div>
      </div>

      <div className={styles.content}>

        {/* ── READING ─────────────────────────────────────────────────── */}
        <Section delay={0}>
          <SectionHead icon={<ReadOutlined />} title="Reading" subtitle="Page layout and navigation" />
          <div className={styles.card}>
            <SettingRow
              label="Reading Direction"
              description="Affects page turn direction and swipe gesture"
            >
              <DirectionPicker
                value={settings.readingDirection}
                onChange={v => updateSettings({ readingDirection: v })}
              />
            </SettingRow>

            <div className={styles.divider} />

            <SettingRow
              label="Default Reading Mode"
              description="How pages are laid out when you open a comic"
            >
              <Select
                value={settings.readingMode}
                onChange={v => updateSettings({ readingMode: v })}
                className={styles.select}
                options={[
                  { value: 'single', label: '⬜  Single Page' },
                  { value: 'double', label: '⬛⬜  Double Page Spread' },
                  { value: 'scroll', label: '↕  Vertical Scroll (Webtoon)' },
                ]}
              />
            </SettingRow>

            <div className={styles.divider} />

            <SettingRow
              label="Page Transition"
              description="Animation when turning pages"
            >
              <Select
                value={settings.transitionAnimation}
                onChange={v => updateSettings({ transitionAnimation: v })}
                className={styles.select}
                options={[
                  { value: 'slide', label: '→  Slide' },
                  { value: 'fade',  label: '◌  Fade' },
                  { value: 'none',  label: '×  Instant (no animation)' },
                ]}
              />
            </SettingRow>
          </div>
        </Section>

        {/* ── DISPLAY ─────────────────────────────────────────────────── */}
        <Section delay={60}>
          <SectionHead icon={<BgColorsOutlined />} title="Display" subtitle="Zoom and background colour" />
          <div className={styles.card}>
            <SettingRow
              label="Zoom Mode"
              description="Behaviour when you tap the centre of a page"
            >
              <Select
                value={settings.zoomMode}
                onChange={v => updateSettings({ zoomMode: v })}
                className={styles.select}
                options={[
                  { value: 'smart',      label: '🎯  Smart Panel Zoom (recommended)' },
                  { value: 'manual',     label: '🔍  Manual Zoom' },
                  { value: 'fit-width',  label: '↔  Fit Width' },
                  { value: 'fit-height', label: '↕  Fit Height' },
                ]}
              />
            </SettingRow>

            <div className={styles.divider} />

            <SettingRow
              label="Reader Background"
              description="Colour shown behind pages in the reader"
            >
              <div className={styles.swatchRow}>
                {BG_OPTIONS.map(opt => (
                  <div key={opt.value} className={styles.swatchWrap}>
                    <ColorSwatch
                      value={opt.value}
                      selected={settings.backgroundColor === opt.value}
                      onChange={v => updateSettings({ backgroundColor: v })}
                    />
                    <span className={styles.swatchLabel}>{opt.label}</span>
                  </div>
                ))}
              </div>
            </SettingRow>

            <div className={styles.divider} />

            <SettingRow label="Show Page Numbers" description="Always-visible page counter at the bottom of the reader">
              <Switch
                checked={settings.showPageNumber}
                onChange={v => updateSettings({ showPageNumber: v })}
              />
            </SettingRow>
          </div>
        </Section>

        {/* ── SHORTCUTS ───────────────────────────────────────────────── */}
        <Section delay={120}>
          <SectionHead icon={<KeyOutlined />} title="Gestures & Shortcuts" subtitle="Available everywhere in the reader" />
          <div className={styles.card}>
            <div className={styles.shortcutGrid}>
              {SHORTCUTS.map(({ key, action }) => (
                <div key={key} className={styles.shortcutRow}>
                  <kbd className={styles.kbd}>{key}</kbd>
                  <span className={styles.shortcutAction}>{action}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ── ABOUT ───────────────────────────────────────────────────── */}
        <Section delay={180}>
          <SectionHead icon={<InfoCircleOutlined />} title="About COMIX" subtitle="Your personal comic library" />
          <div className={styles.card}>
            <div className={styles.aboutInner}>
              <div className={styles.aboutLogo}>
                <svg viewBox="0 0 48 48" width="48" height="48">
                  <rect width="48" height="48" rx="10" fill="#0a0a0a"/>
                  <rect x="4" y="4" width="18" height="22" rx="2.5" fill="#e50914"/>
                  <rect x="25" y="4" width="19" height="10" rx="2.5" fill="#e50914" opacity="0.8"/>
                  <rect x="25" y="17" width="19" height="9" rx="2.5" fill="#e50914" opacity="0.5"/>
                  <rect x="4" y="29" width="11" height="15" rx="2.5" fill="#e50914" opacity="0.65"/>
                  <rect x="18" y="29" width="26" height="15" rx="2.5" fill="#e50914" opacity="0.9"/>
                </svg>
                <div>
                  <div className={styles.aboutName}>COMIX</div>
                  <div className={styles.aboutTagline}>Personal Comic Reader</div>
                </div>
              </div>
              <p className={styles.aboutDesc}>
                Read CBZ, CBR, PDF and image folders from your local drive or Google Drive.
                Google Play Books–style smart panel zoom, Netflix-style library, up to 5 GB per file.
              </p>
              <div className={styles.stackGrid}>
                {STACK.map(({ label, color, bg }) => (
                  <span key={label} className={styles.stackBadge} style={{ color, background: bg, borderColor: `${color}33` }}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <div style={{ height: 48 }} />
      </div>
    </div>
  );
}
