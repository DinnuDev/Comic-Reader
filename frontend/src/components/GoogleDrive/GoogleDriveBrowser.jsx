/**
 * GoogleDriveBrowser
 *
 * A modal for browsing the user's Google Drive, navigating folders,
 * and adding a folder as a Comic Reader source.
 */
import React, { useState, useCallback } from 'react';
import {
  Modal, Breadcrumb, Spin, Button, Empty, Tooltip, message,
} from 'antd';
import {
  FolderOutlined, FolderOpenOutlined, FileOutlined,
  ArrowLeftOutlined, HomeOutlined, PlusCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gdriveApi, sourcesApi, libraryApi } from '../../services/api';
import styles from './GoogleDriveBrowser.module.css';

export default function GoogleDriveBrowser({ accountId, open, onClose }) {
  const queryClient = useQueryClient();
  const [stack, setStack] = useState([{ id: 'root', name: 'My Drive' }]);
  const currentFolder = stack[stack.length - 1];

  const { data, isFetching } = useQuery({
    queryKey: ['gdrive-browse', accountId, currentFolder.id],
    queryFn: () => gdriveApi.browse(currentFolder.id, accountId),
    enabled: open && !!accountId,
    staleTime: 30000,
  });

  const addSourceMutation = useMutation({
    mutationFn: ({ name, folderId }) =>
      sourcesApi.create({ name, type: 'gdrive', gdrive_folder_id: folderId }),
    onSuccess: async (newSource) => {
      message.success(`"${currentFolder.name}" added as source. Scanning…`);
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      if (newSource?.id) {
        try {
          const r = await libraryApi.scanSource(newSource.id);
          message.success(r.message);
          queryClient.invalidateQueries({ queryKey: ['library'] });
        } catch {}
      }
      onClose();
    },
    onError: (err) => message.error(err.response?.data?.error || err.message),
  });

  const navigate = useCallback((folder) => {
    setStack(s => [...s, { id: folder.id, name: folder.name }]);
  }, []);

  const navigateBack = useCallback(() => {
    setStack(s => s.length > 1 ? s.slice(0, -1) : s);
  }, []);

  const navigateTo = useCallback((index) => {
    setStack(s => s.slice(0, index + 1));
  }, []);

  const handleAddSource = useCallback(() => {
    addSourceMutation.mutate({
      name: currentFolder.id === 'root' ? 'Google Drive' : currentFolder.name,
      folderId: currentFolder.id,
    });
  }, [currentFolder, addSourceMutation]);

  const folders = data?.folders || [];
  const comics  = data?.comics  || [];

  return (
    <Modal
      title={
        <div className={styles.modalTitle}>
          <FolderOpenOutlined style={{ color: '#4a9eff', marginRight: 8 }} />
          Browse Google Drive
        </div>
      }
      open={open}
      onCancel={onClose}
      width={720}
      footer={
        <div className={styles.footer}>
          <span className={styles.footerHint}>
            {comics.length} comic{comics.length !== 1 ? 's' : ''} in this folder
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            icon={<PlusCircleOutlined />}
            onClick={handleAddSource}
            loading={addSourceMutation.isPending}
            style={{ background: '#e50914', borderColor: '#e50914' }}
          >
            Add "{currentFolder.name}" as Source
          </Button>
        </div>
      }
      className={styles.modal}
    >
      {/* Breadcrumb navigation */}
      <div className={styles.nav}>
        <Button
          icon={<ArrowLeftOutlined />}
          size="small"
          disabled={stack.length === 1}
          onClick={navigateBack}
          className={styles.backBtn}
        />
        <Breadcrumb
          items={stack.map((item, i) => ({
            title: (
              <button
                className={`${styles.breadcrumb} ${i === stack.length - 1 ? styles.breadcrumbActive : ''}`}
                onClick={() => navigateTo(i)}
              >
                {i === 0 ? <><HomeOutlined /> My Drive</> : item.name}
              </button>
            ),
          }))}
          className={styles.breadcrumbWrap}
        />
      </div>

      {/* Content */}
      <div className={styles.content}>
        {isFetching ? (
          <div className={styles.loading}><Spin /></div>
        ) : (
          <div className={styles.panes}>
            {/* Left pane — folders */}
            <div className={styles.leftPane}>
              <div className={styles.paneLabel}>Folders</div>
              {folders.length === 0 ? (
                <div className={styles.empty}>No subfolders</div>
              ) : (
                folders.map(f => (
                  <button
                    key={f.id}
                    className={styles.folderRow}
                    onClick={() => navigate(f)}
                  >
                    <FolderOutlined className={styles.folderIcon} />
                    <span className={styles.folderName}>{f.name}</span>
                  </button>
                ))
              )}
            </div>

            {/* Right pane — comic files */}
            <div className={styles.rightPane}>
              <div className={styles.paneLabel}>
                Comics ({comics.length})
              </div>
              {comics.length === 0 ? (
                <div className={styles.empty}>No comic files found here</div>
              ) : (
                comics.map(f => (
                  <div key={f.id} className={styles.fileRow}>
                    <FileOutlined className={styles.fileIcon} />
                    <Tooltip title={f.name}>
                      <span className={styles.fileName}>{f.name}</span>
                    </Tooltip>
                    <span className={styles.fileSize}>
                      {f.size ? fmtSize(parseInt(f.size)) : ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function fmtSize(b) {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}
