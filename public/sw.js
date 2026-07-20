/**
 * Service Worker لـ KOSMITIK PWA
 * يخزّن الأصول الثابتة ويتيح العمل بدون إنترنت (البيانات من Firebase cache).
 */

const CACHE_NAME = 'kosmitik-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ─── تثبيت: خزّن الأصول الثابتة ───
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // إن فشل أي أصل، نتجاهل الخطأ ونكمل
      });
    })
  );
  self.skipWaiting();
});

// ─── تفعيل: احذف الكاشات القديمة ───
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── جلب: Network First للـ API، Cache First للأصول ───
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // تجاهل: Firebase، OpenRouter، الـ API الخارجية
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('openrouter') ||
    url.hostname.includes('googleapis') ||
    url.protocol === 'chrome-extension:'
  ) {
    return; // دع الشبكة تتحكم
  }

  // للأصول الثابتة: Cache First (أسرع على iOS)
  if (
    event.request.method === 'GET' &&
    (url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|woff2|woff|css|js)$/) ||
      url.pathname === '/manifest.json')
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // للصفحات: Network First مع fallback للكاش
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/').then((cached) => cached || new Response('غير متصل بالإنترنت', { status: 503 }))
      )
    );
  }
});

// ─── رسائل من الصفحة ───
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
