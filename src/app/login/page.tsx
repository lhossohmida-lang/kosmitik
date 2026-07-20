'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { branding } from '@/lib/branding';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, configured, login, register } = useAuth();
  const { t } = useLanguage();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(email.trim(), password);
      router.replace('/dashboard');
    } catch (err) {
      setError(translateAuthError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16, position: 'relative' }}>
      <div style={{ position: 'absolute', insetInlineEnd: 16, top: 16 }}>
        <LanguageSwitcher />
      </div>
      <div className="card" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>
            {branding.storeName}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {mode === 'login' ? t('login.login') : t('login.register')}
          </div>
        </div>

        {!configured && (
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              borderRadius: 'var(--radius)',
              padding: 12,
              fontSize: 13,
              marginBottom: 16,
              lineHeight: 1.7,
            }}
          >
            {t('login.notConfigured')}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <input
            className="input"
            type="email"
            placeholder={t('login.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            dir="ltr"
            style={{ textAlign: 'right' }}
          />
          <input
            className="input"
            type="password"
            placeholder={t('login.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            dir="ltr"
            style={{ textAlign: 'right' }}
          />

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 13, textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button className="btn" type="submit" disabled={busy || !configured}>
            {busy ? '…' : mode === 'login' ? t('login.submitLogin') : t('login.submitRegister')}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
          style={{
            marginTop: 14,
            width: '100%',
            background: 'none',
            border: 'none',
            color: 'var(--primary)',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {mode === 'login' ? t('login.switchToRegister') : t('login.switchToLogin')}
        </button>
      </div>
    </div>
  );
}

/** ترجمة أخطاء Firebase الشائعة إلى رسائل واضحة باللغة الحالية. */
function translateAuthError(err: unknown, t: (key: string) => string): string {
  const code = (err as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-email': 'login.error.invalidEmail',
    'auth/user-not-found': 'login.error.userNotFound',
    'auth/wrong-password': 'login.error.wrongPassword',
    'auth/invalid-credential': 'login.error.invalidCredential',
    'auth/email-already-in-use': 'login.error.emailInUse',
    'auth/weak-password': 'login.error.weakPassword',
    'auth/network-request-failed': 'login.error.network',
    'auth/too-many-requests': 'login.error.tooMany',
  };
  return t(map[code] || 'login.error.generic');
}
