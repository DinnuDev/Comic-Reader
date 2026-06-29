import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Form, Input, Tabs, Typography } from 'antd';
import { CheckCircleFilled, CheckOutlined, ExclamationCircleOutlined, LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import styles from './AuthPage.module.css';

const { Title, Text } = Typography;

export default function AuthPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPwdFocused, setSignupPwdFocused] = useState(false);
  const [loginCapsOn, setLoginCapsOn] = useState(false);
  const [signupCapsOn, setSignupCapsOn] = useState(false);

  const loginEmailRef = useRef(null);
  const loginPasswordRef = useRef(null);
  const signupUsernameRef = useRef(null);
  const signupEmailRef = useRef(null);
  const signupPasswordRef = useRef(null);

  const [loginForm] = Form.useForm();
  const [signupForm] = Form.useForm();
  const loginIdentifier = Form.useWatch('identifier', loginForm) || '';
  const loginPassword = Form.useWatch('password', loginForm) || '';
  const signupEmail = Form.useWatch('email', signupForm) || '';
  const signupUsername = Form.useWatch('username', signupForm) || '';

  const passwordScore = useMemo(() => {
    const v = signupPassword;
    let score = 0;
    if (v.length >= 8) score += 1;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score += 1;
    if (/\d/.test(v)) score += 1;
    if (/[^A-Za-z0-9]/.test(v)) score += 1;
    return score;
  }, [signupPassword]);

  useEffect(() => {
    if (mode === 'login') {
      setTimeout(() => loginEmailRef.current?.focus(), 40);
    } else {
      setTimeout(() => signupUsernameRef.current?.focus(), 40);
    }
  }, [mode]);

  const suggestEmail = (value) => {
    const v = (value || '').trim().toLowerCase();
    if (!v.includes('@')) return '';
    const [local, domain] = v.split('@');
    if (!local || !domain) return '';

    const typoMap = {
      'gamil.com': 'gmail.com',
      'gmial.com': 'gmail.com',
      'gnail.com': 'gmail.com',
      'hotnail.com': 'hotmail.com',
      'outlok.com': 'outlook.com',
      'yaho.com': 'yahoo.com',
      'icloud.con': 'icloud.com',
    };

    if (typoMap[domain]) {
      return `${local}@${typoMap[domain]}`;
    }
    return '';
  };

  const loginEmailSuggestion = loginIdentifier.includes('@') ? suggestEmail(loginIdentifier) : '';
  const signupEmailSuggestion = suggestEmail(signupEmail);

  const passwordChecks = useMemo(() => ([
    { key: 'len', label: 'At least 8 characters', ok: signupPassword.length >= 8 },
    { key: 'letters', label: 'Upper and lower case letters', ok: /[A-Z]/.test(signupPassword) && /[a-z]/.test(signupPassword) },
    { key: 'number', label: 'At least one number', ok: /\d/.test(signupPassword) },
    { key: 'special', label: 'At least one symbol', ok: /[^A-Za-z0-9]/.test(signupPassword) },
  ]), [signupPassword]);

  const isLoginValid = useMemo(
    () => {
      const identifier = loginIdentifier.trim();
      if (!identifier || loginPassword.length < 1) return false;
      if (identifier.includes('@')) {
        return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(identifier);
      }
      return identifier.length >= 2;
    },
    [loginIdentifier, loginPassword]
  );

  const isSignupValid = useMemo(
    () => (
      signupUsername.trim().length >= 2 &&
      signupUsername.trim().length <= 40 &&
      /[^\s@]+@[^\s@]+\.[^\s@]+/.test(signupEmail) &&
      passwordChecks.every(c => c.ok)
    ),
    [passwordChecks, signupEmail, signupUsername]
  );

  const modeMeta = mode === 'signup'
    ? {
      title: 'Create your account',
      subtitle: 'Join COMIX to securely upload and read comics.',
    }
    : {
      title: 'Welcome back',
      subtitle: 'Sign in to continue reading your comics.',
    };

  const strengthLabel = ['Very weak', 'Weak', 'Fair', 'Strong', 'Excellent'][passwordScore];

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: async () => {
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      navigate('/', { replace: true });
    },
    onError: (err) => {
      setError(err?.response?.data?.error || 'Login failed.');
    },
  });

  const signupMutation = useMutation({
    mutationFn: authApi.signup,
    onSuccess: async () => {
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      navigate('/', { replace: true });
    },
    onError: (err) => {
      setError(err?.response?.data?.error || 'Sign up failed.');
    },
  });

  const isPending = loginMutation.isPending || signupMutation.isPending;

  const items = useMemo(() => ([
    {
      key: 'login',
      label: 'Login',
      children: (
        <Form
          form={loginForm}
          className={styles.form}
          layout="vertical"
          onFinish={(values) => loginMutation.mutate(values)}
        >
          <Form.Item
            label="Email or Username"
            name="identifier"
            rules={[{ required: true, message: 'Email or username is required' }]}
            extra={
              <div className={styles.assistWrap}>
                <span className={styles.fieldHint}>Use your account email or username.</span>
                {loginEmailSuggestion && (
                  <span className={styles.suggestion}>Did you mean {loginEmailSuggestion}?</span>
                )}
              </div>
            }
          >
            <Input
              ref={loginEmailRef}
              size="large"
              className={styles.input}
              prefix={<UserOutlined className={styles.inputIcon} />}
              placeholder="you@example.com or comicfan"
              autoComplete="username"
              onPressEnter={() => loginPasswordRef.current?.focus()}
            />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: 'Password is required' }]}
            extra={
              <div className={styles.assistWrap}>
                <span className={styles.fieldHint}>At least 8 characters.</span>
                {loginCapsOn && (
                  <span className={styles.capsHint}><ExclamationCircleOutlined /> Caps Lock is on</span>
                )}
              </div>
            }
          >
            <Input.Password
              ref={loginPasswordRef}
              size="large"
              className={styles.input}
              prefix={<LockOutlined className={styles.inputIcon} />}
              placeholder="Password"
              autoComplete="current-password"
              onKeyUp={(e) => setLoginCapsOn(e.getModifierState('CapsLock'))}
              onBlur={() => setLoginCapsOn(false)}
            />
          </Form.Item>

          <Form.Item name="remember" valuePropName="checked" initialValue={true} className={styles.rememberWrap}>
            <Checkbox className={styles.rememberCheck}>Remember me for 7 days on this device</Checkbox>
          </Form.Item>

          <p className={styles.sessionNote}>Session security: this keeps you signed in on this browser only.</p>

          <Button
            type="primary"
            htmlType="submit"
            block
            loading={isPending}
            className={styles.submitBtn}
            disabled={!isLoginValid}
          >
            Login
          </Button>
        </Form>
      ),
    },
    {
      key: 'signup',
      label: 'Sign up',
      children: (
        <Form
          form={signupForm}
          className={styles.form}
          layout="vertical"
          onFinish={(values) => signupMutation.mutate(values)}
        >
          <Form.Item
            label="Username"
            name="username"
            rules={[{ required: true, message: 'Username is required' }, { min: 2 }, { max: 40 }]}
          >
            <Input
              ref={signupUsernameRef}
              size="large"
              className={styles.input}
              prefix={<UserOutlined className={styles.inputIcon} />}
              placeholder="Comic fan"
              autoComplete="username"
              onPressEnter={() => signupEmailRef.current?.focus()}
            />
          </Form.Item>
          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, message: 'Email is required' }, { type: 'email' }]}
            extra={
              <div className={styles.assistWrap}>
                {signupEmailSuggestion && (
                  <span className={styles.suggestion}>Did you mean {signupEmailSuggestion}?</span>
                )}
              </div>
            }
          >
            <Input
              ref={signupEmailRef}
              size="large"
              className={styles.input}
              prefix={<MailOutlined className={styles.inputIcon} />}
              placeholder="you@example.com"
              autoComplete="email"
              onPressEnter={() => signupPasswordRef.current?.focus()}
            />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: 'Password is required' }, { min: 8, message: 'At least 8 characters' }]}
            extra={(
              <>
                {(signupPwdFocused || signupPassword.length > 0) && (
                  <div className={styles.passwordAssist}>
                    <div className={styles.strengthTrack}>
                      <span className={`${styles.strengthFill} ${styles['s' + passwordScore]}`} />
                    </div>
                    <span className={styles.strengthLabel}>Strength: {strengthLabel}</span>
                    <div className={styles.requirementsList}>
                      {passwordChecks.map((check) => (
                        <div key={check.key} className={`${styles.requirementItem} ${check.ok ? styles.requirementOk : ''}`}>
                          {check.ok ? <CheckCircleFilled /> : <CheckOutlined />}
                          <span>{check.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {signupCapsOn && (
                  <span className={styles.capsHint}><ExclamationCircleOutlined /> Caps Lock is on</span>
                )}
              </>
            )}
          >
            <Input.Password
              ref={signupPasswordRef}
              size="large"
              className={styles.input}
              prefix={<LockOutlined className={styles.inputIcon} />}
              placeholder="Create a strong password"
              autoComplete="new-password"
              onChange={(e) => setSignupPassword(e.target.value)}
              onFocus={() => setSignupPwdFocused(true)}
              onKeyUp={(e) => setSignupCapsOn(e.getModifierState('CapsLock'))}
              onBlur={() => {
                setSignupCapsOn(false);
                setSignupPwdFocused(false);
              }}
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            block
            loading={isPending}
            className={styles.submitBtn}
            disabled={!isSignupValid}
          >
            Create account
          </Button>
        </Form>
      ),
    },
  ]), [
    isPending,
    loginCapsOn,
    loginEmailSuggestion,
    loginForm,
    loginMutation,
    passwordScore,
    passwordChecks,
    signupPwdFocused,
    signupCapsOn,
    signupEmailSuggestion,
    signupForm,
    signupMutation,
    isLoginValid,
    isSignupValid,
    strengthLabel,
    signupUsername,
    loginPassword,
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.brandPanel}>
          <div className={styles.logoRow}>
            <div className={styles.logoMark}>C</div>
            <div>
              <p className={styles.kicker}>COMIX PREMIUM</p>
              <h1 className={styles.brandTitle}>Read. Collect. Continue.</h1>
            </div>
          </div>
          <p className={styles.brandCopy}>
            Your personal comic vault with secure access, smooth reader controls, and cross-device progress.
          </p>
          <div className={styles.featureGrid}>
            <article className={styles.featureCard}>
              <h3>Secure Sessions</h3>
              <p>Account-based login with protected uploads and reading endpoints.</p>
            </article>
            <article className={styles.featureCard}>
              <h3>Shared Library</h3>
              <p>Once uploaded, comics are available to everyone who is authenticated.</p>
            </article>
          </div>
        </section>

        <section className={`${styles.formPanel} ${mode === 'signup' ? styles.signupMode : ''}`}>
          <div className={styles.formViewport}>
            <Title level={2} className={styles.title}>{modeMeta.title}</Title>
            <Text className={styles.subtitle}>{modeMeta.subtitle}</Text>
            <Text className={styles.microCopy}>Protected by encrypted sessions and secure API access.</Text>

            {mode === 'login' && (
              <div className={styles.trustRow}>
                <span className={styles.trustBadge}>Private sessions</span>
                <span className={styles.trustBadge}>Secure endpoints</span>
                <span className={styles.trustBadge}>Cloud-ready</span>
              </div>
            )}

            {error && <Alert className={styles.error} type="error" showIcon message={error} />}

            <Tabs
              className={styles.tabs}
              activeKey={mode}
              onChange={(key) => {
                setMode(key);
                setError('');
              }}
              items={items}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
