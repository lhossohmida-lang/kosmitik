'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * شبكة أمان ضد تجمّد الواجهة:
 *  - تزيل class الكاميرا العالق عند: تغيّر الصفحة، رجوع التركيز، Escape.
 * إبقاء هذا الـ class عالقاً يُخفي كل الواجهة ويُجمّد التطبيق.
 */
export default function SafetyNet() {
  const pathname = usePathname();

  useEffect(() => {
    document.body.classList.remove('barcode-scanner-active');
  }, [pathname]);

  useEffect(() => {
    const clear = () => document.body.classList.remove('barcode-scanner-active');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear();
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') clear();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('focus', clear);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('focus', clear);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return null;
}
