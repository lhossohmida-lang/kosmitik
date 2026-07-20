'use client';

import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/nav';
import { branding } from '@/lib/branding';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import OnlineIndicator from './OnlineIndicator';
import LanguageSwitcher from './LanguageSwitcher';

/** الشريط العلوي: عنوان الصفحة + مؤشّر الاتصال + خروج. */
export default function TopBar() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { t } = useLanguage();
  const current = NAV_ITEMS.find(
    (i) => pathname === i.href || pathname.startsWith(i.href + '/'),
  );

  return (
    <header
      className="glass-panel"
      style={{
        height: 'var(--topbar-h)',
        borderTop: 'none',
        borderInline: 'none',
        borderBottom: '1px solid var(--glass-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingInline: 16,
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="mobile-only" style={{ fontWeight: 800, color: 'var(--primary)' }}>
          {branding.storeName}
        </span>
        <span style={{ fontWeight: 700, fontSize: 17 }}>
          {current ? t(current.labelKey) : ''}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <OnlineIndicator />
        <LanguageSwitcher compact />
        <button
          onClick={() => logout()}
          className="btn-outline"
          style={{
            padding: '6px 12px',
            borderRadius: 'var(--radius)',
            fontSize: 13,
            fontWeight: 700,
            background: 'transparent',
            border: '1.5px solid var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          {t('common.logout')}
        </button>
      </div>
    </header>
  );
}
