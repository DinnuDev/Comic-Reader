import React, { useState } from 'react';
import {
  Card, Button, List, Tag, Space, Modal, Form, Input,
  Select, Typography, message, Badge, notification,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SyncOutlined,
  FolderOpenOutlined, CloudOutlined, BookOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcesApi, libraryApi } from '../services/api';
import DropZone from '../components/Upload/DropZone';
import GoogleDriveSection from '../components/GoogleDrive/GoogleDriveSection';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import styles from './SourcesPage.module.css';

const { Title, Text } = Typography;

function AnimatedCard({ children, delay = 0 }) {
  const [ref, visible] = useScrollAnimation({ threshold: 0.05 });
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(24px)',
      transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

export default function SourcesPage() {
  const queryClient = useQueryClient();
  const [addModal, setAddModal] = useState(false);
  const [form] = Form.useForm();
  const [sourceType, setSourceType] = useState('local');
  const [scanning, setScanning] = useState(null);

  const { data: sources = [] } = useQuery({ queryKey: ['sources'], queryFn: sourcesApi.getAll });

  // ── Auto-scan on source add ────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: sourcesApi.create,
    onSuccess: async (newSource) => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      message.success('Source added! Scanning for comics…');
      setAddModal(false);
      form.resetFields();
      setSourceType('local');

      if (newSource?.id) {
        setScanning(newSource.id);
        try {
          const result = await libraryApi.scanSource(newSource.id);
          message.success(result.message || 'Scan complete');
          queryClient.invalidateQueries({ queryKey: ['library'] });
          queryClient.invalidateQueries({ queryKey: ['recent'] });
        } catch (err) {
          message.error(`Scan failed: ${err.response?.data?.error || err.message}`);
        } finally {
          setScanning(null);
        }
      }
    },
    onError: (err) => message.error(err.response?.data?.error || 'Failed to add source'),
  });

  const deleteMutation = useMutation({
    mutationFn: sourcesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['library'] });
      message.success('Source removed');
    },
  });

  const handleScan = async (sourceId, sourceName) => {
    setScanning(sourceId);
    try {
      const result = await libraryApi.scanSource(sourceId);
      message.success(`${sourceName}: ${result.message}`);
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['recent'] });
    } catch (err) {
      message.error(`Scan failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setScanning(null);
    }
  };

  const handleDelete = (source) => {
    Modal.confirm({
      title: `Remove "${source.name}"?`,
      content: 'Comics from this source will be removed. Files on disk are not deleted.',
      okText: 'Remove',
      okType: 'danger',
      onOk: () => deleteMutation.mutate(source.id),
    });
  };

  const handleUploaded = (count) => {
    message.success(`${count} comic${count > 1 ? 's' : ''} added!`);
    queryClient.invalidateQueries({ queryKey: ['library'] });
    queryClient.invalidateQueries({ queryKey: ['sources'] });
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Title level={4} className={styles.title}>Sources</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)}>
          Add Local Folder
        </Button>
      </div>

      <div className={styles.content}>

        {/* ── UPLOAD ───────────────────────────────────────────────────── */}
        <AnimatedCard delay={0}>
          <Card title={<><BookOutlined /> Upload Comics</>} className={styles.card}>
            <DropZone onUploaded={handleUploaded} />
          </Card>
        </AnimatedCard>

        {/* ── GOOGLE DRIVE ─────────────────────────────────────────────── */}
        <AnimatedCard delay={80}>
          <Card title={<><CloudOutlined /> Google Drive</>} className={styles.card}>
            <GoogleDriveSection />
          </Card>
        </AnimatedCard>

        {/* ── LOCAL SOURCES LIST ───────────────────────────────────────── */}
        <AnimatedCard delay={160}>
          <Card
            title="Library Sources"
            className={styles.card}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {sources.length} source{sources.length !== 1 ? 's' : ''}
              </Text>
            }
          >
            {sources.length === 0 ? (
              <div className={styles.empty}>
                <FolderOpenOutlined style={{ fontSize: 40, color: '#444' }} />
                <Text type="secondary">No sources yet. Add a local folder or connect Google Drive.</Text>
              </div>
            ) : (
              <List
                dataSource={sources}
                renderItem={(source) => (
                  <List.Item
                    key={source.id}
                    actions={[
                      <Button
                        key="scan"
                        icon={<SyncOutlined spin={scanning === source.id} />}
                        loading={scanning === source.id}
                        onClick={() => handleScan(source.id, source.name)}
                        size="small"
                      >
                        Scan
                      </Button>,
                      <Button
                        key="del"
                        danger
                        icon={<DeleteOutlined />}
                        size="small"
                        onClick={() => handleDelete(source)}
                      />,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        source.type === 'gdrive'
                          ? <CloudOutlined style={{ fontSize: 24, color: '#e50914' }} />
                          : <FolderOpenOutlined style={{ fontSize: 24, color: '#4a9eff' }} />
                      }
                      title={
                        <Space size={6}>
                          <span>{source.name}</span>
                          <Tag color={source.type === 'gdrive' ? 'blue' : 'green'} style={{ margin: 0 }}>
                            {source.type === 'gdrive' ? 'Drive' : 'Local'}
                          </Tag>
                          {source.comic_count > 0 && (
                            <Badge count={source.comic_count} color="#e50914" />
                          )}
                        </Space>
                      }
                      description={
                        <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                          {source.path || source.gdrive_folder_id || '—'}
                        </Text>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </AnimatedCard>
      </div>

      {/* ── ADD LOCAL FOLDER MODAL ───────────────────────────────────────── */}
      <Modal
        title="Add Local Folder Source"
        open={addModal}
        onOk={() => form.submit()}
        onCancel={() => { setAddModal(false); form.resetFields(); setSourceType('local'); }}
        okText="Add & Scan"
        confirmLoading={addMutation.isPending}
      >
        <Form form={form} layout="vertical" initialValues={{ type: 'local' }} onFinish={addMutation.mutate}>
          <Form.Item name="type" style={{ display: 'none' }}>
            <Input value="local" />
          </Form.Item>
          <Form.Item name="name" label="Source Name" rules={[{ required: true }]}>
            <Input placeholder="My Comics" />
          </Form.Item>
          <Form.Item
            name="path"
            label="Folder Path"
            rules={[{ required: true }]}
            extra="Full path to your comics folder — e.g. C:\Comics or /home/user/comics"
          >
            <Input placeholder="C:\Comics" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
