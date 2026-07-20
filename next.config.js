/**
 * إعداد Next.js واحد لثلاثة أهداف بناء:
 *  - الويب / التطوير:            output = standalone  (افتراضي)
 *  - الحاسوب (Electron / EXE):   BUILD_TARGET=desktop  → standalone (خادم Next مستقل داخل Electron)
 *  - الهاتف (Capacitor / APK):   BUILD_TARGET=capacitor → export (ملفات ثابتة داخل WebView)
 *
 * نتحكّم بالهدف عبر متغيّر البيئة BUILD_TARGET فقط، فلا يتكرّر الكود.
 */
const BUILD_TARGET = process.env.BUILD_TARGET || 'web';
const isCapacitor = BUILD_TARGET === 'capacitor';
const isDesktop = BUILD_TARGET === 'desktop';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // الهاتف والحاسوب (Electron و Capacitor) يحتاجان تصديراً ثابتاً (مجلد out).
  // Vercel يدير Next.js تلقائياً (بلا output).
  ...(isCapacitor || isDesktop ? { output: 'export' } : {}),

  // في التصدير الثابت لا يوجد مُحسِّن صور من الخادم.
  images: { unoptimized: true },

  // مسارات نسبية داخل WebView الهاتف (file://) بدل الجذر المطلق.
  ...(isCapacitor ? { trailingSlash: true } : {}),

  // لا نُوقف البناء بسبب أخطاء eslint أثناء التغليف.
  eslint: { ignoreDuringBuilds: true },

  // headers لـ Service Worker (PWA على iOS)
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
