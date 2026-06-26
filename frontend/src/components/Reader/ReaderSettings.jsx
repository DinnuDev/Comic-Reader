import React from 'react';
import { Drawer, Form, Select, Switch, Radio, Typography, Divider } from 'antd';
import { useAppStore } from '../../store';

const { Text } = Typography;

export default function ReaderSettings({ open, onClose }) {
  const { settings, updateSettings } = useAppStore();

  return (
    <Drawer
      title="Reader Settings"
      placement="right"
      width={320}
      open={open}
      onClose={onClose}
    >
      <Form layout="vertical" size="small">
        <Divider orientation="left" plain>Reading</Divider>

        <Form.Item label="Reading Direction">
          <Radio.Group
            value={settings.readingDirection}
            onChange={e => updateSettings({ readingDirection: e.target.value })}
            buttonStyle="solid"
          >
            <Radio.Button value="ltr">Left → Right</Radio.Button>
            <Radio.Button value="rtl">Right → Left</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item label="Reading Mode">
          <Select
            value={settings.readingMode}
            onChange={v => updateSettings({ readingMode: v })}
            options={[
              { value: 'single', label: 'Single Page' },
              { value: 'double', label: 'Double Page (Spread)' },
              { value: 'scroll', label: 'Vertical Scroll (Webtoon)' },
            ]}
          />
        </Form.Item>

        <Divider orientation="left" plain>Display</Divider>

        <Form.Item label="Zoom Mode">
          <Select
            value={settings.zoomMode}
            onChange={v => updateSettings({ zoomMode: v })}
            options={[
              { value: 'smart', label: 'Smart Panel Zoom' },
              { value: 'manual', label: 'Manual Zoom' },
              { value: 'fit-width', label: 'Fit Width' },
              { value: 'fit-height', label: 'Fit Height' },
            ]}
          />
        </Form.Item>

        <Form.Item label="Background Color">
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

        <Divider orientation="left" plain>Navigation</Divider>

        <Form.Item label="Page Transition">
          <Select
            value={settings.transitionAnimation}
            onChange={v => updateSettings({ transitionAnimation: v })}
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

        <Divider plain />
        <Text type="secondary" style={{ fontSize: 12 }}>
          Tip: Single tap in center to zoom into panels. Double tap to toggle zoom. Pinch to zoom. Swipe to navigate.
        </Text>
      </Form>
    </Drawer>
  );
}
