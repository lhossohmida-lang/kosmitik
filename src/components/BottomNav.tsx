'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/nav';
import { branding } from '@/lib/branding';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import OnlineIndicator from './OnlineIndicator';
import LanguageSwitcher from './LanguageSwitcher';
import NavIcon from './NavIcon';

/**
 * ملاح الهاتف — على طراز درج تطبيقات سامسونج:
 * زرّ عائم (⋮) يخفي كل الأيقونات؛ عند الضغط تظهر شبكة زجاجية تملأ الشاشة،
 * ثلاث أيقونات في كل سطر. الضغط على أيقونة يفتح صفحتها ويُغلق الدرج.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const { logout, permissions } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  // نفس تصفية الصلاحيات المستخدَمة في الشريط الجانبي.
  const allowedNav = NAV_ITEMS.filter(
    (item) => permissions.includes('*') || permissions.includes(item.href) || item.href === '/pos',
  );

  // إغلاق الدرج عند تغيّر المسار + منع تمرير الخلفية أثناء فتحه.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (open) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      {/* ===== الزرّ العائم (⋮) ===== */}
      <div
        className="no-select"
        style={{
          position: 'fixed',
          insetInline: 0,
          bottom: 0,
          height: 'var(--bottomnav-h)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingInline: 16,
          background: 'var(--surface)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          backdropFilter: 'var(--glass-blur)',
          borderTop: '1px solid var(--glass-border)',
          zIndex: 40,
        }}
      >
        <OnlineIndicator />
        <button
          onClick={() => setOpen(true)}
          aria-label={t('nav.menu')}
          className="no-select"
          style={{
            width: 54,
            height: 54,
            marginTop: -22,
            borderRadius: 20,
            border: '1px solid var(--glass-border)',
            background: 'linear-gradient(180deg, #2b96ff 0%, var(--primary) 100%)',
            color: '#fff',
            boxShadow: '0 8px 22px rgba(10,132,255,0.4), inset 0 1px 0 rgba(255,255,255,0.4)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Dots />
        </button>
        <LanguageSwitcher compact />
      </div>

      {/* ===== الدرج الكامل ===== */}
      {open && (
        <div
          className="no-select"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(230,238,250,0.55)',
            WebkitBackdropFilter: 'saturate(180%) blur(28px)',
            backdropFilter: 'saturate(180%) blur(28px)',
            display: 'flex',
            flexDirection: 'column',
            animation: 'launcher-in 0.22s ease',
          }}
        >
          {/* رأس الدرج */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
            }}
          >
            <b style={{ fontSize: 22, color: 'var(--primary)', letterSpacing: 0.5 }}>{branding.storeName}</b>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LanguageSwitcher compact />
              <button
                onClick={() => logout()}
                style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, border: '1px solid var(--glass-border)', background: 'var(--surface-strong)', color: 'var(--danger)' }}
              >
                {t('common.logout')}
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label={t('common.close')}
                style={{ width: 38, height: 38, borderRadius: 999, border: '1px solid var(--glass-border)', background: 'var(--surface-strong)', color: 'var(--text)', fontSize: 20, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          </div>

          {/* شبكة الأيقونات — 3 في السطر تملأ الشاشة */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 14,
              padding: '8px 18px calc(env(safe-area-inset-bottom) + 28px)',
              alignContent: 'start',
            }}
          >
            {allowedNav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 2px',
                  }}
                >
                  <span
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      maxWidth: 96,
                      borderRadius: 24,
                      display: 'grid',
                      placeItems: 'center',
                      background: active
                        ? 'linear-gradient(180deg, rgba(10,132,255,0.22), rgba(10,132,255,0.10))'
                        : 'var(--surface)',
                      WebkitBackdropFilter: 'var(--glass-blur)',
                      backdropFilter: 'var(--glass-blur)',
                      border: `1.5px solid ${active ? 'rgba(10,132,255,0.6)' : 'var(--glass-border)'}`,
                      boxShadow: active ? '0 10px 26px rgba(10,132,255,0.3)' : 'var(--shadow)',
                    }}
                  >
                    <NavIcon img={item.img} emoji={item.icon} size={52} />
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: active ? 'var(--primary)' : 'var(--text)', textAlign: 'center', lineHeight: 1.25 }}>
                    {t(item.labelKey)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes launcher-in {
          from { opacity: 0; transform: scale(1.04); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}

function Dots() {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 5, height: 5, borderRadius: 999, background: '#fff' }} />
      ))}
    </span>
  );
}
