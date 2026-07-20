'use client';

/**
 * PwaRegister — يُسجّل Service Worker ويعرض تلميح تثبيت على iOS.
 * لا يُقدَّم في بيئة APK/Electron (يتحقق من navigator.standalone).
 */
import { useEffect, useState } from 'react';

export default function PwaRegister() {
  const [showIosBanner, setShowIosBanner] = useState(false);

  useEffect(() => {
    // ─── تسجيل Service Worker ───
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service Worker مسجّل:', reg.scope);
          // إن كان هناك تحديث جديد، فعّله تلقائياً
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  newWorker.postMessage('skipWaiting');
                }
              });
            }
          });
        })
        .catch((err) => console.warn('[PWA] فشل تسجيل Service Worker:', err));
    }

    // ─── كشف iOS لعرض تلميح التثبيت ───
    const isIos =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad مع iPadOS

    const isStandalone =
      (window.navigator as { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;

    const bannerDismissed = sessionStorage.getItem('pwa-banner-dismissed');

    // اعرض التلميح فقط على iOS وليس مثبّتاً بعد ولم يُغلق اليوم
    if (isIos && !isStandalone && !bannerDismissed) {
      // انتظر ثانيتين قبل العرض (بعد تحميل الصفحة)
      const timer = setTimeout(() => setShowIosBanner(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  function dismiss() {
    sessionStorage.setItem('pwa-banner-dismissed', '1');
    setShowIosBanner(false);
  }

  if (!showIosBanner) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'env(safe-area-inset-bottom, 16px)',
        left: 16,
        right: 16,
        zIndex: 9999,
        background: 'rgba(10, 10, 20, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 18,
        padding: '14px 16px',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.12)',
        fontFamily: '-apple-system, system-ui, sans-serif',
        direction: 'rtl',
      }}
    >
      {/* أيقونة التطبيق */}
      <img
        src="/icon-192.png"
        alt="أيقونة التطبيق"
        style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0 }}
      />

      {/* النص */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
          ثبّت التطبيق على الشاشة الرئيسية
        </div>
        <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.5 }}>
          اضغط على{' '}
          <span style={{ display: 'inline-block', background: 'rgba(255,255,255,0.15)', borderRadius: 6, padding: '1px 6px', fontSize: 13 }}>
            ⎙
          </span>{' '}
          ثم «إضافة إلى الشاشة الرئيسية»
        </div>
      </div>

      {/* زر الإغلاق */}
      <button
        onClick={dismiss}
        style={{
          background: 'rgba(255,255,255,0.15)',
          border: 'none',
          color: '#fff',
          width: 28,
          height: 28,
          borderRadius: 14,
          fontSize: 16,
          cursor: 'pointer',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="إغلاق"
      >
        ✕
      </button>
    </div>
  );
}
