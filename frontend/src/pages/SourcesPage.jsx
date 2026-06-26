import React, { useState } from 'react';
import {
  Card, Button, List, Tag, Space, Modal, Form, Input,
  Select, Typography, message, Alert, Badge, Tooltip,
  Steps, Collapse, notification,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SyncOutlined,
  FolderOpenOutlined, CloudOutlined, LinkOutlined,
  CheckCircleOutlined, DisconnectOutlined,
  QuestionCircleOutlined, BookOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcesApi, gdriveApi, libraryApi } from '../services/api';
import DropZone from '../components/Upload/DropZone';
import styles from './SourcesPage.module.css';

const { Title, Text, Paragraph, Link } = Typography;

export default function SourcesPage() {
  const queryClient = useQueryClient();
  const [addModal, setAddModal] = useState(false);
  const [form] = Form.useForm();
  const [sourceType, setSourceType] = useState('local');
  const [scanning, setScanning] = useState(null);
  const [notifApi, contextHolder] = notification.useNotification();

  const { data: sources = [] } = useQuery({ queryKey: ['sources'], queryFn: sourcesApi.getAll });

  const { data: gdriveStatus } = useQuery({
    queryKey: ['gdrive-status'],
    queryFn: gdriveApi.getStatus,
    retry: false,
  });

  const addMutation = useMutation({
    mutationFn: sourcesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      message.success('Source added!');
      setAddModal(false);
      form.resetFields();
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

  const handleGDriveConnect = async () => {
    try {
      const { url } = await gdriveApi.getAuthUrl();
      window.open(url, '_self');
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      notifApi.error({
        message: 'Cannot Connect Google Drive',
        description: errMsg,
        duration: 10,
      });
    }
  };

  const handleGDriveDisconnect = () => {
    Modal.confirm({
      title: 'Disconnect Google Drive?',
      content: 'Your Google Drive sources will remain but you will need to reconnect to scan or read from them.',
      okText: 'Disconnect',
      okType: 'danger',
      onOk: async () => {
        await gdriveApi.disconnect();
        queryClient.invalidateQueries({ queryKey: ['gdrive-status'] });
        message.success('Disconnected from Google Drive');
      },
    });
  };

  const handleScan = async (sourceId, sourceName) => {
    setScanning(sourceId);
    try {
      const result = await libraryApi.scanSource(sourceId);
      message.success(`${sourceName}: ${result.message}`);
      queryClient.invalidateQueries({ queryKey: ['library'] });
    } catch (err) {
      message.error(`Scan failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setScanning(null);
    }
  };

  const handleDelete = (source) => {
    Modal.confirm({
      title: `Remove "${source.name}"?`,
      content: 'Comics from this source will be removed from the library. Files on disk are not deleted.',
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

  const gdConfigured = gdriveStatus?.configured;
  const gdConnected = gdriveStatus?.connected;

  return (
    <div className={styles.page}>
      {contextHolder}
      <div className={styles.header}>
        <Title level={4} className={styles.title}>Sources</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)}>
          Add Source
        </Button>
      </div>

      <div className={styles.content}>

        {/* Upload section */}
        <Card title={<><BookOutlined /> Upload Comics</>} className={styles.card}>
          <DropZone onUploaded={handleUploaded} />
        </Card>

        {/* Google Drive section */}
        <Card
          title={<><CloudOutlined /> Google Drive</>}
          className={styles.card}
          extra={gdConfigured && gdConnected && gdriveStatus?.user && (
            <Text type="secondary" style={{ fontSize: 12 }}>{gdriveStatus.user.email}</Text>
          )}
        >
          {!gdConfigured ? (
            // Credentials not set up
            <div>
              <Alert
                type="warning"
                showIcon
                message="Google Drive credentials not configured"
                description={
                  <div>
                    <p>Add your Google API credentials to <code>backend/.env</code> to enable Google Drive:</p>
                    <pre className={styles.envCode}>{`GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/gdrive/callback`}</pre>
                  </div>
                }
                style={{ marginBottom: 16 }}
              />
              <Collapse ghost items={[{
                key: 'setup',
                label: <span><QuestionCircleOutlined /> How to set up Google Drive</span>,
                children: (
                  <Steps direction="vertical" size="small" items={[
                    { title: 'Open Google Cloud Console', description: <Link href="https://console.cloud.google.com" target="_blank">console.cloud.google.com</Link> },
                    { title: 'Create a project and enable Google Drive API', description: 'APIs & Services → Enable APIs → Google Drive API' },
                    { title: 'Create OAuth2 credentials', description: 'APIs & Services → Credentials → Create OAuth client ID → Web application' },
                    { title: 'Add authorized redirect URI', description: 'Add: http://localhost:3001/api/gdrive/callback' },
                    { title: 'Copy credentials to .env', description: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then restart the server' },
                  ]} />
                ),
              }]} />
            </div>
          ) : gdConnected ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                message={`Connected${gdriveStatus?.user ? ` as ${gdriveStatus.user.email}` : ''}`}
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
              />
              <Space>
                <Button danger icon={<DisconnectOutlined />} onClick={handleGDriveDisconnect}>
                  Disconnect
                </Button>
                <Button icon={<PlusOutlined />} onClick={() => { setSourceType('gdrive'); setAddModal(true); }}>
                  Add Drive Folder
                </Button>
              </Space>
            </Space>
          ) : (
            <Space direction="vertical">
              <Paragraph type="secondary">Connect your Google Drive to read comics stored in the cloud.</Paragraph>
              <Button type="primary" ghost icon={<LinkOutlined />} onClick={handleGDriveConnect}>
                Connect Google Drive
              </Button>
            </Space>
          )}
        </Card>

        {/* Source list */}
        <Card
          title="Library Sources"
          className={styles.card}
          extra={<Text type="secondary" style={{ fontSize: 12 }}>{sources.length} source{sources.length !== 1 ? 's' : ''}</Text>}
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
                        ? <CloudOutlined style={{ fontSize: 24, color: '#e94560' }} />
                        : <FolderOpenOutlined style={{ fontSize: 24, color: '#4a9eff' }} />
                    }
                    title={
                      <Space size={6}>
                        <span>{source.name}</span>
                        <Tag color={source.type === 'gdrive' ? 'blue' : 'green'} style={{ margin: 0 }}>
                          {source.type === 'gdrive' ? 'Drive' : 'Local'}
                        </Tag>
                        {source.comic_count > 0 && (
                          <Badge count={source.comic_count} color="#e94560" />
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
      </div>

      {/* Add source modal */}
      <Modal
        title="Add Source"
        open={addModal}
        onOk={() => form.submit()}
        onCancel={() => { setAddModal(false); form.resetFields(); setSourceType('local'); }}
        okText="Add Source"
        confirmLoading={addMutation.isPending}
      >
        <Form form={form} layout="vertical" initialValues={{ type: 'local' }} onFinish={addMutation.mutate}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="My Comics" />
          </Form.Item>
          <Form.Item name="type" label="Type">
            <Select
              options={[
                { value: 'local', label: 'Local Folder' },
                { value: 'gdrive', label: 'Google Drive Folder', disabled: !gdConnected },
              ]}
              onChange={setSourceType}
            />
          </Form.Item>
          {sourceType === 'local' && (
            <Form.Item
              name="path"
              label="Folder Path"
              rules={[{ required: true }]}
              extra="Full path to your comics folder e.g. C:\Comics"
            >
              <Input placeholder="C:\Comics" />
            </Form.Item>
          )}
          {sourceType === 'gdrive' && (
            <Form.Item
              name="gdrive_folder_id"
              label="Google Drive Folder ID"
              extra="The ID from the folder URL: drive.google.com/drive/folders/FOLDER_ID"
            >
              <Input placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}

