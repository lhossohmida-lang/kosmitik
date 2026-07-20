import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { branding } from '@/lib/branding';
import EscapeClear from '@/components/EscapeClear';
import PwaRegister from '@/components/PwaRegister';

export const metadata: Metadata = {
  title: `${branding.storeName} — نقطة البيع`,
  description: 'نقطة بيع وإدارة مخزون تعمل على iOS وAndroid وWindows',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: branding.storeName,
    startupImage: [
      // iPhone 13 Pro (1170×2532)
      {
        url: '/icon-512.png',
        media:
          '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)',
      },
    ],
  },
  other: {
    // iOS: اجعل التطبيق يعمل بشاشة كاملة بلا شريط Safari
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': branding.storeName,
    'application-name': branding.storeName,
    // منع التحديد التلقائي وزووم المحتوى على iOS
    'format-detection': 'telephone=no',
  },
  icons: {
    apple: [
      { url: '/icon-192.png', sizes: '192x192' },
      { url: '/icon-512.png', sizes: '512x512' },
    ],
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: branding.colors.primary },
    { media: '(prefers-color-scheme: dark)', color: branding.colors.primaryDark },
  ],
  viewportFit: 'cover', // مهم: يتجاوز الـ notch والـ home indicator على iPhone
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>
        <LanguageProvider>
          <AuthProvider>
            <EscapeClear />
            <PwaRegister />
            {children}
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
