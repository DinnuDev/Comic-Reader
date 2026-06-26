/**
 * GoogleDriveSection
 *
 * Complete self-service Google Drive authentication.
 *
 * Flow when Client ID is not yet configured:
 *   1. Show a 3-step wizard (open Google Cloud Console → create Desktop OAuth
 *      client → paste the Client ID)
 *   2. User pastes ONE value — no secrets, no .env editing, no restart
 *   3. Client ID is saved to .env and applied live via the /api/setup endpoint
 *
 * Flow when configured:
 *   - "Connect Google Drive" opens a popup (PKCE flow, no client secret)
 *   - Connected accounts show avatar + email + storage quota
 *   - "Browse" opens the folder browser to add folders as sources
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Button, Input, Avatar, Space, Popconfirm, Progress,
  Steps, Alert, Spin, Typography, message, Tag, Tooltip,
} from 'antd';
import {
  CheckCircleOutlined, DisconnectOutlined, FolderAddOutlined,
  LinkOutlined, GoogleOutlined, CheckOutlined, CopyOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gdriveApi, setupApi } from '../../services/api';
import GoogleDriveBrowser from './GoogleDriveBrowser';
import styles from './GoogleDriveSection.module.css';

const { Text, Paragraph } = Typography;

// ── Google Cloud Console deep-link ────────────────────────────────────────
const CONSOLE_LINKS = {
  newProject:    'https://console.cloud.google.com/projectcreate',
  enableDriveApi:'https://console.cloud.google.com/apis/library/drive.googleapis.com',
  createCreds:   'https://console.cloud.google.com/apis/credentials/oauthclient',
};

const REDIRECT_URI = 'http://localhost:3001/api/gdrive/callback';

// ── Setup wizard (3 steps, no secrets needed) ─────────────────────────────

function SetupWizard({ onDone }) {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState('');
  const [step, setStep] = useState(0);

  const saveMutation = useMutation({
    mutationFn: setupApi.saveGoogleClientId,
    onSuccess: () => {
      message.success('Google Client ID saved!');
      queryClient.invalidateQueries({ queryKey: ['gdrive-status'] });
      onDone?.();
    },
    onError: (err) => message.error(err.response?.data?.error || err.message),
  });

  const STEPS = [
    {
      title: 'Create a Google Cloud project',
      description: (
        <div className={styles.stepBody}>
          <Paragraph className={styles.stepText}>
            Go to Google Cloud Console and create a free project (takes 30 seconds).
          </Paragraph>
          <Button
            icon={<LinkOutlined />}
            onClick={() => window.open(CONSOLE_LINKS.newProject, '_blank', 'noopener')}
          >
            Open Google Cloud Console
          </Button>
        </div>
      ),
    },
    {
      title: 'Enable Google Drive API',
      description: (
        <div className={styles.stepBody}>
          <Paragraph className={styles.stepText}>
            In your project, enable the Google Drive API.
          </Paragraph>
          <Button
            icon={<LinkOutlined />}
            onClick={() => window.open(CONSOLE_LINKS.enableDriveApi, '_blank', 'noopener')}
          >
            Enable Drive API →
          </Button>
        </div>
      ),
    },
    {
      title: 'Create OAuth credentials',
      description: (
        <div className={styles.stepBody}>
          <Paragraph className={styles.stepText}>
            APIs & Services → Credentials → <strong>+ Create Credentials</strong> →
            OAuth client ID → Application type: <strong>Desktop app</strong> → Create.
          </Paragraph>
          <Alert
            type="info"
            showIcon
            message="Authorized redirect URI (add this)"
            description={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <code className={styles.redirectCode}>{REDIRECT_URI}</code>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => { navigator.clipboard.writeText(REDIRECT_URI); message.success('Copied!'); }}
                />
              </div>
            }
            style={{ marginBottom: 12 }}
          />
          <Button
            icon={<LinkOutlined />}
            onClick={() => window.open(CONSOLE_LINKS.createCreds, '_blank', 'noopener')}
            style={{ marginBottom: 16 }}
          >
            Create Credentials →
          </Button>
          <div className={styles.pasteRow}>
            <Input
              placeholder="Paste your Client ID here  (e.g. 123456…apps.googleusercontent.com)"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              size="large"
              onPressEnter={() => saveMutation.mutate(clientId)}
              status={clientId && !clientId.includes('.apps.googleusercontent.com') ? 'error' : ''}
            />
            <Button
              type="primary"
              size="large"
              icon={<CheckOutlined />}
              loading={saveMutation.isPending}
              disabled={!clientId.includes('.apps.googleusercontent.com')}
              onClick={() => saveMutation.mutate(clientId)}
              style={{ background: '#e50914', borderColor: '#e50914' }}
            >
              Save &amp; Connect
            </Button>
          </div>
          <Text type="secondary" className={styles.noSecretNote}>
            ✓ No client secret needed — COMIX uses PKCE (the modern, secret-free OAuth standard)
          </Text>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.wizard}>
      <div className={styles.wizardHeader}>
        <div className={styles.wizardTitle}>Connect Google Drive</div>
        <div className={styles.wizardSub}>One-time setup · 3 quick steps</div>
      </div>

      <Steps
        direction="vertical"
        current={step}
        onChange={setStep}
        className={styles.steps}
        items={STEPS.map((s, i) => ({
          title: <span className={styles.stepTitle}>{s.title}</span>,
          description: step === i ? s.description : null,
          status: step > i ? 'finish' : step === i ? 'process' : 'wait',
        }))}
      />

      <div className={styles.wizardNav}>
        {step < STEPS.length - 1 && (
          <Button type="primary" onClick={() => setStep(s => s + 1)}
            style={{ background: '#e50914', borderColor: '#e50914' }}>
            Next step →
          </Button>
        )}
        {step > 0 && (
          <Button onClick={() => setStep(s => s - 1)}>← Back</Button>
        )}
      </div>
    </div>
  );
}

// ── Account card ──────────────────────────────────────────────────────────

function AccountCard({ account, onBrowse, onDisconnect }) {
  const { data: about, isLoading } = useQuery({
    queryKey: ['gdrive-about', account.id],
    queryFn: () => gdriveApi.getAbout(account.id),
    staleTime: 60000, retry: false,
  });

  const quota = about?.storageQuota;
  const usedPct = quota
    ? Math.round((parseInt(quota.usage || 0) / parseInt(quota.limit || 1)) * 100)
    : null;

  return (
    <div className={styles.accountCard}>
      <div className={styles.accountTop}>
        {account.picture
          ? <Avatar src={account.picture} size={46} />
          : <Avatar size={46} style={{ background: '#e50914', fontSize: 18 }}>
              {account.email[0].toUpperCase()}
            </Avatar>}
        <div className={styles.accountInfo}>
          <div className={styles.accountEmail}>{account.email}</div>
          {account.name && <div className={styles.accountName}>{account.name}</div>}
          <Tag color="success" icon={<CheckCircleOutlined />} style={{ marginTop: 4, fontSize: 11 }}>
            Connected
          </Tag>
        </div>
        <div className={styles.accountActions}>
          <Tooltip title="Browse folders & add to library">
            <Button icon={<FolderAddOutlined />} type="primary" ghost size="small" onClick={onBrowse}>
              Browse
            </Button>
          </Tooltip>
          <Popconfirm title="Disconnect this account?" okText="Disconnect" okType="danger" onConfirm={onDisconnect}>
            <Button icon={<DisconnectOutlined />} danger size="small">Disconnect</Button>
          </Popconfirm>
        </div>
      </div>

      {isLoading ? (
        <div style={{ marginTop: 10, paddingLeft: 60 }}><Spin size="small" /></div>
      ) : quota && usedPct !== null ? (
        <div className={styles.quota}>
          <Progress percent={usedPct} size="small" showInfo={false}
            strokeColor={usedPct > 85 ? '#ff4d4f' : usedPct > 60 ? '#faad14' : '#52c41a'} />
          <Text className={styles.quotaText}>
            {fmtSize(parseInt(quota.usage || 0))} of {quota.limit ? fmtSize(parseInt(quota.limit)) : '∞'} used
          </Text>
        </div>
      ) : null}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function GoogleDriveSection() {
  const queryClient = useQueryClient();
  const [browserOpen, setBrowserOpen]       = useState(false);
  const [browserAccountId, setBrowserAccId] = useState(null);
  const [connecting, setConnecting]         = useState(false);
  const [showWizard, setShowWizard]         = useState(false);
  const popupRef = useRef(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ['gdrive-status'],
    queryFn: gdriveApi.getStatus,
    retry: false,
    refetchInterval: connecting ? 2000 : false,
  });

  const disconnectMutation = useMutation({
    mutationFn: (id) => gdriveApi.disconnect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gdrive-status'] });
      message.success('Google Drive disconnected');
    },
  });

  // Popup auth flow
  const handleConnect = useCallback(async () => {
    try {
      const { url } = await gdriveApi.getAuthUrl();
      const w = 520, h = 640;
      const l = window.screenX + (window.outerWidth  - w) / 2;
      const t = window.screenY + (window.outerHeight - h) / 2;
      popupRef.current = window.open(url, 'gdrive-oauth',
        `width=${w},height=${h},left=${l},top=${t},popup=1,resizable=0`);
      setConnecting(true);
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    }
  }, []);

  // postMessage from popup callback page
  useEffect(() => {
    const h = (e) => {
      if (e.data?.type === 'gdrive-connected') {
        popupRef.current?.close();
        setConnecting(false);
        queryClient.invalidateQueries({ queryKey: ['gdrive-status'] });
        message.success('Google Drive connected!');
      } else if (e.data?.type === 'gdrive-error') {
        popupRef.current?.close();
        setConnecting(false);
        const p = e.data.payload;
        message.error(p === 'invalid_grant' ? 'Auth code expired — try again.' : p || 'Authentication failed');
      }
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [queryClient]);

  // Detect popup closed without finishing
  useEffect(() => {
    if (!connecting) return;
    const iv = setInterval(() => {
      if (popupRef.current?.closed) { setConnecting(false); clearInterval(iv); }
    }, 600);
    return () => clearInterval(iv);
  }, [connecting]);

  if (isLoading) return <div style={{ padding: 16 }}><Spin /></div>;

  const configured = status?.configured;
  const accounts   = status?.accounts || [];

  // ── Not configured → setup wizard ────────────────────────────────────
  if (!configured || showWizard) {
    return (
      <SetupWizard onDone={() => {
        setShowWizard(false);
        queryClient.invalidateQueries({ queryKey: ['gdrive-status'] });
      }} />
    );
  }

  // ── Configured → show accounts + connect button ───────────────────────
  return (
    <div className={styles.section}>
      {accounts.map(acc => (
        <AccountCard
          key={acc.id}
          account={acc}
          onBrowse={() => { setBrowserAccId(acc.id); setBrowserOpen(true); }}
          onDisconnect={() => disconnectMutation.mutate(acc.id)}
        />
      ))}

      <div className={styles.connectRow}>
        <Button
          icon={connecting ? <Spin size="small" /> : <LinkOutlined />}
          onClick={handleConnect}
          disabled={connecting}
          size="large"
          style={accounts.length === 0 ? { background: '#e50914', borderColor: '#e50914', color: '#fff' } : {}}
          type={accounts.length === 0 ? 'primary' : 'default'}
        >
          {connecting ? 'Waiting for sign-in…'
            : accounts.length > 0 ? 'Connect another account'
            : 'Connect Google Drive'}
        </Button>
        {connecting && <Text type="secondary" style={{ fontSize: 12 }}>Complete sign-in in the popup window</Text>}
        <Button type="link" size="small" onClick={() => setShowWizard(true)} style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.3)' }}>
          Change Client ID
        </Button>
      </div>

      <GoogleDriveBrowser
        accountId={browserAccountId}
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
      />
    </div>
  );
}

function fmtSize(b) {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}
