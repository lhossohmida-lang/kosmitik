'use client';

import { useEffect, useState } from 'react';

/**
 * كشف واجهة الهاتف عبر matchMedia (يتفاعل مع تغيّر حجم النافذة).
 * mounted يمنع اختلاف الترميز بين الخادم والعميل (نبدأ بواجهة الحاسوب).
 */
export function useIsMobile(breakpoint = 768): { isMobile: boolean; mounted: boolean } {
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia(`(max-width:${breakpoint}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);

  return { isMobile, mounted };
}
