import React, { useState } from 'react';
import {
  Button, Modal, Form, Input, Typography,
  message, Popconfirm, Tooltip, Tag, Empty,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SyncOutlined,
  FolderOutlined, CloudOutlined, BookOutlined,
  DatabaseOutlined, UploadOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcesApi, libraryApi } from '../services/api';
import DropZone from '../components/Upload/DropZone';
import GoogleDriveSection from '../components/GoogleDrive/GoogleDriveSection';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import styles from './SourcesPage.module.css';

const { Text } = Typography;

function FadeIn({ children, delay = 0 }) {
  const [ref, visible] = useScrollAnimation({ threshold: 0.04 });
  return (
    <div ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 0.45s ease ${delay}ms, transform 0.45s ease ${delay}ms`,
      }}>
      {children}
    </div>
  );
}

// ── Source stat card ──────────────────────────────────────────────────────
function SourceCard({ source, scanning, onScan, onDelete }) {
  const isLocal  = source.type === 'local';
  const isScan   = scanning === source.id;

  return (
    <div className={styles.sourceCard}>
      <div className={styles.sourceCardTop}>
        <div className={`${styles.sourceTypeIcon} ${isLocal ? styles.iconLocal : styles.iconDrive}`}>
          {isLocal ? <FolderOutlined /> : <CloudOutlined />}
        </div>

        <div className={styles.sourceInfo}>
          <div className={styles.sourceName}>{source.name}</div>
          <div className={styles.sourcePath}>
            {source.path || source.gdrive_folder_id || '—'}
          </div>
          <div className={styles.sourceMeta}>
            <Tag
              className={styles.sourceTypeTag}
              color={isLocal ? 'geekblue' : 'volcano'}
            >
              {isLocal ? 'Local' : 'Google Drive'}
            </Tag>
            {source.comic_count > 0 && (
              <span className={styles.comicCount}>
                <BookOutlined style={{ fontSize: 11 }} />
                {source.comic_count} comic{source.comic_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div className={styles.sourceActions}>
          <Tooltip title={isScan ? 'Scanning…' : 'Scan for new comics'}>
            <Button
              type="primary"
              shape="circle"
              size="middle"
              className={`${styles.sourceActionBtn} ${styles.sourceScanBtn}`}
              icon={<SyncOutlined spin={isScan} />}
              loading={isScan}
              onClick={() => onScan(source.id, source.name)}
              aria-label={`Scan source ${source.name}`}
            />
          </Tooltip>
          <Popconfirm
            title={`Remove "${source.name}"?`}
            description="Comics from this source will be removed. Files on disk are not deleted."
            okText="Remove"
            okType="danger"
            onConfirm={() => onDelete(source.id)}
          >
            <Button
              danger
              shape="circle"
              size="middle"
              className={`${styles.sourceActionBtn} ${styles.sourceActionDanger}`}
              icon={<DeleteOutlined />}
              aria-label={`Remove source ${source.name}`}
            />
          </Popconfirm>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SourcesPage() {
  const queryClient = useQueryClient();
  const [addModal, setAddModal] = useState(false);
  const [form] = Form.useForm();
  const [scanning, setScanning] = useState(null);
  const [activeTab, setActiveTab] = useState('upload'); // upload | gdrive | local

  const { data: sources = [] } = useQuery({ queryKey: ['sources'], queryFn: sourcesApi.getAll });

  const totalComics = sources.reduce((s, src) => s + (src.comic_count || 0), 0);

  const addMutation = useMutation({
    mutationFn: sourcesApi.create,
    onSuccess: async (newSource) => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      message.success('Folder added — scanning for comics…');
      setAddModal(false);
      form.resetFields();
      if (newSource?.id) {
        setScanning(newSource.id);
        try {
          const r = await libraryApi.scanSource(newSource.id);
          message.success(r.message);
          queryClient.invalidateQueries({ queryKey: ['library'] });
          queryClient.invalidateQueries({ queryKey: ['recent'] });
        } catch (e) {
          message.error(e.response?.data?.error || e.message);
        } finally {
          setScanning(null);
        }
      }
    },
    onError: (e) => message.error(e.response?.data?.error || 'Failed to add source'),
  });

  const deleteMutation = useMutation({
    mutationFn: sourcesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['library'] });
      message.success('Source removed');
    },
  });

  const handleScan = async (id, name) => {
    setScanning(id);
    try {
      const r = await libraryApi.scanSource(id);
      message.success(`${name}: ${r.message}`);
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['recent'] });
    } catch (e) {
      message.error(e.response?.data?.error || e.message);
    } finally {
      setScanning(null);
    }
  };

  const handleUploaded = (count) => {
    message.success(`${count} comic${count > 1 ? 's' : ''} added to library!`);
    queryClient.invalidateQueries({ queryKey: ['library'] });
    queryClient.invalidateQueries({ queryKey: ['sources'] });
  };

  const TABS = [
    { id: 'upload', label: 'Upload Files',    icon: <UploadOutlined /> },
    { id: 'gdrive', label: 'Google Drive',     icon: <CloudOutlined /> },
    { id: 'local',  label: 'Local Folders',    icon: <FolderOutlined /> },
  ];

  return (
    <div className={styles.page}>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className={styles.hero}>
        <div>
          <h1 className={styles.heroTitle}>Sources</h1>
          <p className={styles.heroSub}>Manage where COMIX finds your comics</p>
        </div>

        {/* Stats pills */}
        <div className={styles.statPills}>
          <div className={styles.pill}>
            <DatabaseOutlined className={styles.pillIcon} />
            <span className={styles.pillVal}>{sources.length}</span>
            <span className={styles.pillLabel}>Source{sources.length !== 1 ? 's' : ''}</span>
          </div>
          <div className={styles.pill}>
            <BookOutlined className={styles.pillIcon} />
            <span className={styles.pillVal}>{totalComics}</span>
            <span className={styles.pillLabel}>Comic{totalComics !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* ── Tab nav ──────────────────────────────────────────────────── */}
      <div className={styles.tabBar}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab panels ───────────────────────────────────────────────── */}
      <div className={styles.panels}>

        {activeTab === 'upload' && (
          <FadeIn delay={0}>
            <div className={styles.panelCard}>
              <div className={styles.panelHeader}>
                <UploadOutlined className={styles.panelIcon} />
                <div>
                  <div className={styles.panelTitle}>Upload Comics</div>
                  <div className={styles.panelSub}>
                    Drop CBZ, CBR, PDF or ZIP files — up to 5 GB each. Comics appear in your
                    library immediately while pages are indexed in the background.
                  </div>
                </div>
              </div>
              <DropZone onUploaded={handleUploaded} />
            </div>
          </FadeIn>
        )}

        {activeTab === 'gdrive' && (
          <FadeIn delay={0}>
            <div className={styles.panelCard}>
              <div className={styles.panelHeader}>
                <CloudOutlined className={styles.panelIcon} style={{ color: '#e50914' }} />
                <div>
                  <div className={styles.panelTitle}>Google Drive</div>
                  <div className={styles.panelSub}>
                    Connect your Google account to read comics stored in Drive.
                    Navigate your folders and add any folder as a library source.
                  </div>
                </div>
              </div>
              <GoogleDriveSection />
            </div>
          </FadeIn>
        )}

        {activeTab === 'local' && (
          <FadeIn delay={0}>
            <div className={styles.panelCard}>
              <div className={styles.panelHeader}>
                <FolderOutlined className={styles.panelIcon} style={{ color: '#4a9eff' }} />
                <div>
                  <div className={styles.panelTitle}>Local Folders</div>
                  <div className={styles.panelSub}>
                    Add a folder on this computer. COMIX will scan it for CBZ, CBR, PDF and
                    image-folder comics and auto-index them.
                  </div>
                </div>
              </div>

              {/* Existing sources */}
              {sources.length === 0 ? (
                <Empty
                  image={<FolderOutlined style={{ fontSize: 44, color: '#333' }} />}
                  description={<Text type="secondary">No sources yet</Text>}
                  style={{ padding: '24px 0' }}
                >
                  <Button type="primary" icon={<PlusOutlined />}
                    className={styles.localAddBtn}
                    onClick={() => setAddModal(true)}>
                    Add Folder
                  </Button>
                </Empty>
              ) : (
                <div className={styles.sourceList}>
                  {sources.map(src => (
                    <SourceCard
                      key={src.id}
                      source={src}
                      scanning={scanning}
                      onScan={handleScan}
                      onDelete={(id) => deleteMutation.mutate(id)}
                    />
                  ))}
                  <Button
                    icon={<PlusOutlined />}
                    onClick={() => setAddModal(true)}
                    className={styles.addMoreBtn}
                  >
                    Add another folder
                  </Button>
                </div>
              )}
            </div>
          </FadeIn>
        )}

      </div>

      {/* ── Add Local Folder modal ───────────────────────────────────── */}
      <Modal
        title={
          <span>
            <FolderOutlined style={{ color: '#4a9eff', marginRight: 8 }} />
            Add Local Folder
          </span>
        }
        open={addModal}
        onOk={() => form.submit()}
        onCancel={() => { setAddModal(false); form.resetFields(); }}
        okText="Add & Scan"
        okButtonProps={{ className: styles.modalPrimaryBtn }}
        confirmLoading={addMutation.isPending}
        width={480}
      >
        <Form form={form} layout="vertical" onFinish={v => addMutation.mutate({ ...v, type: 'local' })}>
          <Form.Item name="name" label="Display Name" rules={[{ required: true }]}>
            <Input placeholder="My Comics" prefix={<BookOutlined />} />
          </Form.Item>
          <Form.Item
            name="path"
            label="Folder Path"
            rules={[{ required: true }]}
            extra="Full path to your comics folder — e.g. C:\Comics"
          >
            <Input placeholder="C:\Comics" prefix={<FolderOutlined />} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
