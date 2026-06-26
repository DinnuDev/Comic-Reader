import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Input, Select, Button, Tabs, Empty, Spin, Typography,
  Space, message, Tooltip, Dropdown, notification, Drawer,
} from 'antd';
import {
  AppstoreOutlined, UnorderedListOutlined,
  ReloadOutlined, BookOutlined, ScanOutlined, UploadOutlined,
  ClockCircleOutlined, HeartOutlined, PlusCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { libraryApi, sourcesApi } from '../services/api';
import ComicCard from '../components/Library/ComicCard';
import ComicListItem from '../components/Library/ComicListItem';
import DropZone from '../components/Upload/DropZone';
import styles from './LibraryPage.module.css';

const { Title, Text } = Typography;
const { Search } = Input;

export default function LibraryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('grid');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('title');
  const [activeTab, setActiveTab] = useState('all');
  const [scanningSource, setScanningSource] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [notifApi, contextHolder] = notification.useNotification();

  // Handle OAuth callback params (?gdrive=connected or ?gdrive=error)
  useEffect(() => {
    const gdrive = searchParams.get('gdrive');
    const reason = searchParams.get('reason');
    if (gdrive === 'connected') {
      notifApi.success({ message: 'Google Drive Connected', description: 'You can now add Google Drive folders as sources.' });
      setSearchParams({});
    } else if (gdrive === 'error') {
      const msg = reason === 'invalid_grant'
        ? 'The authorization code expired or was already used. Please try connecting again.'
        : reason
          ? decodeURIComponent(reason)
          : 'Google Drive connection failed.';
      notifApi.error({ message: 'Google Drive Error', description: msg, duration: 8 });
      setSearchParams({});
    }
  }, [searchParams]);

  const { data: libraryData, isLoading } = useQuery({
    queryKey: ['library', search, sortBy, activeTab],
    queryFn: () => libraryApi.getAll({
      search: search || undefined,
      sort: sortBy,
      favorite: activeTab === 'favorites' ? 'true' : undefined,
    }),
  });

  const { data: recentComics } = useQuery({
    queryKey: ['recent'],
    queryFn: libraryApi.getRecent,
  });

  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: sourcesApi.getAll,
  });

  const favMutation = useMutation({
    mutationFn: libraryApi.toggleFavorite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  });

  const handleScan = async (sourceId) => {
    setScanningSource(sourceId);
    try {
      const result = await libraryApi.scanSource(sourceId);
      message.success(result.message);
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['recent'] });
    } catch (err) {
      message.error(`Scan failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setScanningSource(null);
    }
  };

  const handleUploaded = useCallback((count) => {
    message.success(`${count} comic${count > 1 ? 's' : ''} added to library!`);
    queryClient.invalidateQueries({ queryKey: ['library'] });
    queryClient.invalidateQueries({ queryKey: ['sources'] });
  }, [queryClient]);

  const comics = libraryData?.comics || [];
  const displayComics = activeTab === 'recent' ? (recentComics || []) : comics;
  const hasComics = (libraryData?.total || 0) > 0;

  const scanItems = (sources || []).map(s => ({
    key: s.id,
    icon: <ScanOutlined />,
    label: `Scan: ${s.name}`,
    onClick: () => handleScan(s.id),
  }));

  const tabItems = [
    { key: 'all', label: <span><BookOutlined /> All ({libraryData?.total || 0})</span> },
    { key: 'recent', label: <span><ClockCircleOutlined /> Recent</span> },
    { key: 'favorites', label: <span><HeartOutlined /> Favorites</span> },
  ];

  return (
    <div className={styles.page}>
      {contextHolder}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <Title level={4} className={styles.pageTitle}>Library</Title>
        <Space wrap>
          <Search
            placeholder="Search comics, series..."
            allowClear
            onSearch={v => setSearch(v)}
            onChange={e => !e.target.value && setSearch('')}
            className={styles.search}
          />
          <Select
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: 'title', label: 'Title' },
              { value: 'date_added', label: 'Date Added' },
              { value: 'last_read', label: 'Last Read' },
              { value: 'series', label: 'Series' },
            ]}
            className={styles.sort}
          />
          <Tooltip title={viewMode === 'grid' ? 'List view' : 'Grid view'}>
            <Button
              icon={viewMode === 'grid' ? <UnorderedListOutlined /> : <AppstoreOutlined />}
              onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
            />
          </Tooltip>
          <Button
            icon={<UploadOutlined />}
            onClick={() => setShowUpload(true)}
          >
            Upload
          </Button>
          {scanItems.length > 0 && (
            <Dropdown menu={{ items: scanItems }} disabled={!scanItems.length}>
              <Button icon={<ReloadOutlined spin={!!scanningSource} />} loading={!!scanningSource}>
                Scan
              </Button>
            </Dropdown>
          )}
        </Space>
      </div>

      {/* Compact drop zone always visible below toolbar */}
      <div className={styles.compactUpload}>
        <DropZone compact onUploaded={handleUploaded} />
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        className={styles.tabs}
      />

      {/* Content */}
      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}><Spin size="large" /></div>
        ) : displayComics.length === 0 ? (
          <Empty
            image={<BookOutlined style={{ fontSize: 64, color: '#333' }} />}
            description={
              <div className={styles.emptyState}>
                <Text strong style={{ fontSize: 16 }}>
                  {search ? `No results for "${search}"` : 'Your library is empty'}
                </Text>
                <Text type="secondary">
                  {search ? 'Try a different search term.' : 'Upload comics using the button above, or add a source folder.'}
                </Text>
                {!search && (
                  <Space>
                    <Button type="primary" icon={<UploadOutlined />} onClick={() => setShowUpload(true)}>
                      Upload Comics
                    </Button>
                    <Button icon={<PlusCircleOutlined />} onClick={() => navigate('/sources')}>
                      Add Source
                    </Button>
                  </Space>
                )}
              </div>
            }
            className={styles.empty}
          />
        ) : viewMode === 'grid' ? (
          <div className={styles.grid}>
            {displayComics.map(comic => (
              <ComicCard
                key={comic.id}
                comic={comic}
                onRead={() => navigate(`/read/${comic.id}`)}
                onFavorite={() => favMutation.mutate(comic.id)}
              />
            ))}
          </div>
        ) : (
          <div className={styles.list}>
            {displayComics.map(comic => (
              <ComicListItem
                key={comic.id}
                comic={comic}
                onRead={() => navigate(`/read/${comic.id}`)}
                onFavorite={() => favMutation.mutate(comic.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Full upload drawer */}
      <Drawer
        title="Upload Comics"
        placement="right"
        width={480}
        open={showUpload}
        onClose={() => setShowUpload(false)}
        extra={<Text type="secondary" style={{ fontSize: 12 }}>CBZ · CBR · PDF · ZIP</Text>}
      >
        <DropZone onUploaded={(count) => { handleUploaded(count); }} />
      </Drawer>
    </div>
  );
}
