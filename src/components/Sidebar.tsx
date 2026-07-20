'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/nav';
import { branding } from '@/lib/branding';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import LanguageSwitcher from './LanguageSwitcher';
import NavIcon from './NavIcon';

/** الشريط الجانبي الثابت — للحاسوب فقط (يختفي تحت 768px). */
export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const { permissions } = useAuth();

  const allowedNav = NAV_ITEMS.filter(
    (item) =>
      permissions.includes('*') || permissions.includes(item.href) || item.href === '/pos'
  );

  return (
    <aside
      className="desktop-only no-select glass-panel"
      style={{
        width: 'var(--sidebar-w)',
        borderInlineStart: 'none',
        borderInlineEnd: '1px solid var(--glass-border)',
        height: '100dvh',
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: 'var(--topbar-h)',
          display: 'flex',
          alignItems: 'center',
          paddingInline: 20,
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: 0.5,
          color: 'var(--primary)',
          borderBottom: '1px solid var(--glass-border)',
        }}
      >
        {branding.storeName}
      </div>

      <nav style={{ padding: 8, overflowY: 'auto', flex: 1 }}>
        {allowedNav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 14px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 4,
                fontWeight: active ? 700 : 500,
                color: active ? '#fff' : 'var(--text)',
                background: active ? 'linear-gradient(180deg, #2b96ff 0%, var(--primary) 100%)' : 'transparent',
                boxShadow: active ? '0 6px 16px rgba(10,132,255,0.32)' : 'none',
                transition: 'background 0.15s ease',
              }}
            >
              <NavIcon img={item.img} emoji={item.icon} size={24} />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
        <LanguageSwitcher />
      </div>
    </aside>
  );
}
