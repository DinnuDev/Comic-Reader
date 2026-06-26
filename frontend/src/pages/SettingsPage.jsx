import React from 'react';
import { Card, Form, Select, Switch, Radio, Typography, Space, Tag } from 'antd';
import { useAppStore } from '../store';
import styles from './SettingsPage.module.css';

const { Title, Text, Paragraph } = Typography;

export default function SettingsPage() {
  const { settings, updateSettings } = useAppStore();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Title level={4} className={styles.title}>Settings</Title>
      </div>

      <div className={styles.content}>
        <Card title="Reader Preferences" className={styles.card}>
          <Form layout="vertical">
            <Form.Item label="Reading Direction">
              <Radio.Group
                value={settings.readingDirection}
                onChange={e => updateSettings({ readingDirection: e.target.value })}
                buttonStyle="solid"
              >
                <Radio.Button value="ltr">Left → Right</Radio.Button>
                <Radio.Button value="rtl">Right → Left (Manga)</Radio.Button>
              </Radio.Group>
            </Form.Item>

            <Form.Item label="Default Reading Mode">
              <Select
                value={settings.readingMode}
                onChange={v => updateSettings({ readingMode: v })}
                style={{ width: 240 }}
                options={[
                  { value: 'single', label: 'Single Page' },
                  { value: 'double', label: 'Double Page (Spread)' },
                  { value: 'scroll', label: 'Vertical Scroll (Webtoon)' },
                ]}
              />
            </Form.Item>

            <Form.Item label="Zoom Mode">
              <Select
                value={settings.zoomMode}
                onChange={v => updateSettings({ zoomMode: v })}
                style={{ width: 240 }}
                options={[
                  { value: 'smart', label: 'Smart Panel Zoom (recommended)' },
                  { value: 'manual', label: 'Manual Zoom' },
                  { value: 'fit-width', label: 'Fit Width' },
                  { value: 'fit-height', label: 'Fit Height' },
                ]}
              />
            </Form.Item>

            <Form.Item label="Page Background">
              <Radio.Group
                value={settings.backgroundColor}
                onChange={e => updateSettings({ backgroundColor: e.target.value })}
                buttonStyle="solid"
              >
                <Radio.Button value="#000">Black</Radio.Button>
                <Radio.Button value="#1a1a1a">Dark</Radio.Button>
                <Radio.Button value="#fff">White</Radio.Button>
                <Radio.Button value="#f5f0e8">Sepia</Radio.Button>
              </Radio.Group>
            </Form.Item>

            <Form.Item label="Page Transition">
              <Select
                value={settings.transitionAnimation}
                onChange={v => updateSettings({ transitionAnimation: v })}
                style={{ width: 200 }}
                options={[
                  { value: 'slide', label: 'Slide' },
                  { value: 'fade', label: 'Fade' },
                  { value: 'none', label: 'None' },
                ]}
              />
            </Form.Item>

            <Form.Item label="Show Page Numbers">
              <Switch
                checked={settings.showPageNumber}
                onChange={v => updateSettings({ showPageNumber: v })}
              />
            </Form.Item>
          </Form>
        </Card>

        <Card title="Interaction Guide" className={styles.card}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {[
              { gesture: 'Single tap (center)', action: 'Zoom into panel / Toggle controls' },
              { gesture: 'Double tap', action: 'Toggle 2× zoom at tap point' },
              { gesture: 'Tap left/right edge', action: 'Previous / Next page' },
              { gesture: 'Swipe left/right', action: 'Next / Previous page' },
              { gesture: 'Pinch to zoom', action: 'Free zoom in/out' },
              { gesture: 'Drag (when zoomed)', action: 'Pan the page' },
              { gesture: '← → Arrow keys', action: 'Navigate pages' },
              { gesture: 'F key', action: 'Toggle fullscreen' },
              { gesture: 'Esc', action: 'Exit reader' },
            ].map(({ gesture, action }) => (
              <div key={gesture} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <Tag style={{ fontFamily: 'monospace' }}>{gesture}</Tag>
                <Text type="secondary" style={{ textAlign: 'right' }}>{action}</Text>
              </div>
            ))}
          </Space>
        </Card>

        <Card title="About" className={styles.card}>
          <Paragraph type="secondary">
            Comic Reader — A Google Play Books-inspired comic reader.<br />
            Supports CBZ, CBR, PDF, and image folders.
          </Paragraph>
          <Space>
            <Tag color="blue">React 18</Tag>
            <Tag color="green">Ant Design 5</Tag>
            <Tag color="orange">Node.js</Tag>
            <Tag color="purple">SQLite</Tag>
          </Space>
        </Card>
      </div>
    </div>
  );
}
