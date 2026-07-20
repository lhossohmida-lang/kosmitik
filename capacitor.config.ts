import type { CapacitorConfig } from '@capacitor/cli';

/**
 * إعداد Capacitor لنسخة أندرويد (APK).
 * appId يجب أن يطابق اسم الحزمة المسجّل في google-services.json = KOSMITIK.app
 * webDir = out (ناتج `BUILD_TARGET=capacitor next build` → تصدير ثابت).
 */
const config: CapacitorConfig = {
  appId: 'KOSMITIK.app',
  appName: 'shop',
  webDir: 'out',
  android: {
    allowMixedContent: true,
  },
};

export default config;
