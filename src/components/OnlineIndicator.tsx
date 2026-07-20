'use client';

import { useEffect, useState } from 'react';
import { enableNetwork, disableNetwork } from 'firebase/firestore';
import { db, firebaseConfigured } from '@/lib/firebase';

/**
 * مؤشّر الاتصال + تبديل يدوي متصل/غير متصل (enableNetwork/disableNetwork).
 * التبديل اليدوي مفيد عند ضعف الشبكة لتفادي بطء المزامنة — والكتابات تبقى
 * fire-and-forget على الكاش المحلي في الحالتين.
 */
export default function OnlineIndicator() {
  const [browserOnline, setBrowserOnline] = useState(true);
  const [manualOffline, setManualOffline] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBrowserOnline(navigator.onLine);
    const on = () => setBrowserOnline(true);
    const off = () => setBrowserOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const connected = browserOnline && !manualOffline;

  async function toggle() {
    if (!firebaseConfigured || busy) return;
    setBusy(true);
    try {
      if (manualOffline) {
        await enableNetwork(db);
        setManualOffline(false);
      } else {
        await disableNetwork(db);
        setManualOffline(true);
      }
    } catch {
      // فشل التبديل لا يجب أن يُعطّل الواجهة.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      title={connected ? 'متصل — اضغط للعمل بلا إنترنت' : 'غير متصل — اضغط للاتصال'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        border: 'none',
        background: 'transparent',
        fontSize: 12,
        fontWeight: 700,
        color: connected ? 'var(--success)' : 'var(--text-muted)',
      }}
    >
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: connected ? 'var(--success)' : '#94a3b8',
          boxShadow: connected ? '0 0 0 3px rgba(22,163,74,0.15)' : 'none',
        }}
      />
      {connected ? 'متصل' : 'بلا اتصال'}
    </button>
  );
}
