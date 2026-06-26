/**
 * GoogleDriveSection
 *
 * Complete Google Drive authentication UI:
 * - Shows connected accounts with avatar, email, storage quota
 * - "Connect Google Drive" button that opens OAuth in a popup
 * - Folder browser to add Drive folders as sources
 * - Setup guide when credentials are not configured
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Alert, Button, Avatar, Space, Popconfirm, Tooltip,
  Progress, Collapse, Steps, message, Tag, Spin, Typography,
} from 'antd';
import {
  CheckCircleOutlined, DisconnectOutlined, FolderAddOutlined,
  ReloadOutlined, LinkOutlined, QuestionCircleOutlined,
  CloudOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gdriveApi } from '../../services/api';
import GoogleDriveBrowser from './GoogleDriveBrowser';
import styles from './GoogleDriveSection.module.css';

const { Text, Paragraph, Link } = Typography;

export default function GoogleDriveSection() {
  const queryClient = useQueryClient();
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserAccountId, setBrowserAccountId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const popupRef = useRef(null);

  const { data: status } = useQuery({
    queryKey: ['gdrive-status'],
    queryFn: gdriveApi.getStatus,
    retry: false,
    refetchInterval: connecting ? 2000 : false,
  });

  const disconnectMutation = useMutation({
    mutationFn: (accountId) => gdriveApi.disconnect(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gdrive-status'] });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      message.success('Google Drive disconnected');
    },
  });

  // ── Popup OAuth flow ───────────────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    try {
      const { url } = await gdriveApi.getAuthUrl();

      // Open a centred popup
      const w = 520, h = 640;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top  = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(
        url,
        'gdrive-oauth',
        `width=${w},height=${h},left=${left},top=${top},popup=1,resizable=0`
      );
      popupRef.current = popup;
      setConnecting(true);
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    }
  }, []);

  // Listen for postMessage from the popup callback page
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'gdrive-connected') {
        popupRef.current?.close();
        setConnecting(false);
        queryClient.invalidateQueries({ queryKey: ['gdrive-status'] });
        message.success('Google Drive connected!');
      } else if (e.data?.type === 'gdrive-error') {
        popupRef.current?.close();
        setConnecting(false);
        const reason = e.data.payload;
        const msg = reason === 'invalid_grant'
          ? 'Auth code expired — please try again.'
          : reason || 'Authentication failed.';
        message.error(msg);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [queryClient]);

  // Detect popup closed without finishing auth
  useEffect(() => {
    if (!connecting) return;
    const interval = setInterval(() => {
      if (popupRef.current?.closed) {
        setConnecting(false);
        clearInterval(interval);
      }
    }, 600);
    return () => clearInterval(interval);
  }, [connecting]);

  const configured = status?.configured;
  const accounts   = status?.accounts || [];

  // ── Not configured — setup guide ───────────────────────────────────────
  if (!configured) {
    return (
      <div className={styles.section}>
        <Alert
          type="warning"
          showIcon
          message="Google Drive credentials not configured"
          description={
            <div>
              Add your OAuth2 credentials to{' '}
              <code>backend/.env</code> to enable Google Drive:
              <pre className={styles.envCode}>{`GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/gdrive/callback`}</pre>
            </div>
          }
          style={{ marginBottom: 16 }}
        />
        <Collapse
          ghost
          items={[{
            key: '1',
            label: (
              <span style={{ color: 'rgba(255,255,255,0.65)' }}>
                <QuestionCircleOutlined style={{ marginRight: 6 }} />
                How to set up Google Drive (5 steps)
              </span>
            ),
            children: (
              <Steps
                direction="vertical"
                size="small"
                current={-1}
                items={[
                  {
                    title: 'Open Google Cloud Console',
                    description: <Link href="https://console.cloud.google.com" target="_blank" rel="noreferrer">console.cloud.google.com</Link>,
                  },
                  {
                    title: 'Create a project',
                    description: 'Top-left dropdown → New Project',
                  },
                  {
                    title: 'Enable Google Drive API',
                    description: 'APIs & Services → Enable APIs → search "Google Drive API" → Enable',
                  },
                  {
                    title: 'Create OAuth 2.0 credentials',
                    description: (
                      <span>
                        APIs & Services → Credentials → Create Credentials → OAuth client ID →
                        Application type: <b>Web application</b> →
                        Add redirect URI: <code>http://localhost:3001/api/gdrive/callback</code>
                      </span>
                    ),
                  },
                  {
                    title: 'Paste credentials into backend/.env and restart',
                    description: 'Copy Client ID and Client Secret, add to .env, run npm run dev',
                  },
                ]}
              />
            ),
          }]}
        />
      </div>
    );
  }

  // ── Configured — show accounts ─────────────────────────────────────────
  return (
    <div className={styles.section}>
      {/* Connected accounts */}
      {accounts.map(account => (
        <AccountCard
          key={account.id}
          account={account}
          onBrowse={() => { setBrowserAccountId(account.id); setBrowserOpen(true); }}
          onDisconnect={() => disconnectMutation.mutate(account.id)}
        />
      ))}

      {/* Connect button */}
      <Button
        icon={connecting ? <Spin size="small" /> : <LinkOutlined />}
        onClick={handleConnect}
        disabled={connecting}
        style={{ marginTop: accounts.length > 0 ? 8 : 0 }}
      >
        {connecting
          ? 'Waiting for authentication…'
          : accounts.length > 0
            ? 'Connect another account'
            : 'Connect Google Drive'}
      </Button>

      {connecting && (
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
          Complete sign-in in the popup window
        </Text>
      )}

      {/* Folder browser modal */}
      <GoogleDriveBrowser
        accountId={browserAccountId}
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
      />
    </div>
  );
}

// ── Account card ──────────────────────────────────────────────────────────

function AccountCard({ account, onBrowse, onDisconnect }) {
  const { data: about, isLoading } = useQuery({
    queryKey: ['gdrive-about', account.id],
    queryFn: () => gdriveApi.getAbout(account.id),
    staleTime: 60000,
    retry: false,
  });

  const quota = about?.storageQuota;
  const usedPct = quota
    ? Math.round((parseInt(quota.usage || 0) / parseInt(quota.limit || 1)) * 100)
    : null;

  return (
    <div className={styles.accountCard}>
      <div className={styles.accountTop}>
        {account.picture ? (
          <Avatar src={account.picture} size={44} />
        ) : (
          <Avatar size={44} style={{ background: '#e50914', fontSize: 18 }}>
            {account.email[0].toUpperCase()}
          </Avatar>
        )}
        <div className={styles.accountInfo}>
          <div className={styles.accountEmail}>{account.email}</div>
          {account.name && <div className={styles.accountName}>{account.name}</div>}
          <Tag color="green" style={{ marginTop: 4, fontSize: 10 }}>
            <CheckCircleOutlined /> Connected
          </Tag>
        </div>
        <div className={styles.accountActions}>
          <Tooltip title="Browse & add folders">
            <Button
              icon={<FolderAddOutlined />}
              size="small"
              type="primary"
              ghost
              onClick={onBrowse}
            >
              Browse
            </Button>
          </Tooltip>
          <Popconfirm
            title="Disconnect this account?"
            onConfirm={onDisconnect}
            okText="Disconnect"
            okType="danger"
          >
            <Button icon={<DisconnectOutlined />} size="small" danger>
              Disconnect
            </Button>
          </Popconfirm>
        </div>
      </div>

      {/* Storage quota bar */}
      {isLoading ? (
        <div style={{ marginTop: 10 }}><Spin size="small" /></div>
      ) : quota && usedPct !== null ? (
        <div className={styles.quota}>
          <Progress
            percent={usedPct}
            size="small"
            strokeColor={usedPct > 85 ? '#ff4d4f' : usedPct > 60 ? '#faad14' : '#52c41a'}
            showInfo={false}
          />
          <Text className={styles.quotaText}>
            {fmtSize(parseInt(quota.usage || 0))} used of{' '}
            {quota.limit ? fmtSize(parseInt(quota.limit)) : 'unlimited'}
          </Text>
        </div>
      ) : null}
    </div>
  );
}

function fmtSize(b) {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}
