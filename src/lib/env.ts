/**
 * كشف بيئة التشغيل تلقائياً: Electron (حاسوب) مقابل Capacitor (هاتف) مقابل ويب.
 * نستخدمه لتبديل سلوك الكاميرا والطباعة والتخزين المؤقّت للـ Firestore.
 * كل الدوال آمنة على الخادم (SSR) — تُعيد false عندما لا يوجد window.
 */

export type Platform = 'electron' | 'capacitor' | 'web';

export function isElectron(): boolean {
  if (typeof window === 'undefined') return false;
  // نُعرّض جسراً باسم electronAPI من preload، ونحتاط بفحص userAgent.
  const w = window as unknown as { electronAPI?: unknown };
  return Boolean(w.electronAPI) || /electron/i.test(navigator.userAgent || '');
}

export function isCapacitor(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function isWeb(): boolean {
  return !isElectron() && !isCapacitor();
}

export function getPlatform(): Platform {
  if (isElectron()) return 'electron';
  if (isCapacitor()) return 'capacitor';
  return 'web';
}

/** الحاسوب/الويب يدعم عدة تبويبات للكاش الدائم؛ الهاتف تبويب واحد. */
export function supportsMultiTab(): boolean {
  return !isCapacitor();
}
