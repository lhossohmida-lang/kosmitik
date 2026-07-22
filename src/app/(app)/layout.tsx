'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { branding } from '@/lib/branding';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import ErrorBoundary from '@/components/ErrorBoundary';
import SafetyNet from '@/components/SafetyNet';
import KeyNormalizer from '@/components/KeyNormalizer';
import LanguageSwitcher from '@/components/LanguageSwitcher';

/**
 * تخطيط الصفحات المحميّة.
 *  - صاحب المتجر: شريط جانبي/سفلي كامل بكل الخانات.
 *  - العامل (seller): واجهة **بيع فقط** — لا يرى غير نقطة البيع.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, configured, isSeller, permissions, logout } = useAuth();
  const { t } = useLanguage();
  const { isMobile, mounted } = useIsMobile();

  useEffect(() => {
    if (loading) return;
    if (!configured || !user) {
      router.replace('/login');
      return;
    }
    // حماية المسارات للصلاحيات
    if (isSeller) {
      const hasPermission =
        permissions.includes('*') ||
        permissions.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
        pathname === '/pos';

      if (!hasPermission) {
        router.replace('/pos');
      }
    }
  }, [loading, user, configured, isSeller, permissions, pathname, router]);

  if (loading) {
    return (
      <div style={{ height: '100dvh', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
        {t('common.loading')}
      </div>
    );
  }

  if (!configured || !user) return null;


  // ===== الواجهة المشتركة =====
  const mobile = mounted && isMobile;

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <SafetyNet />
      <KeyNormalizer />
      {!mobile && <Sidebar />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!mobile && <TopBar />}
        <main
          style={{
            flex: 1,
            padding: 16,
            paddingTop: mobile ? 'calc(max(env(safe-area-inset-top, 0px), 12px) + 16px)' : 16,
            paddingBottom: mobile ? 'calc(var(--bottomnav-h) + 16px)' : 16,
          }}
        >
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        {mobile && <BottomNav />}
      </div>
    </div>
  );
}
