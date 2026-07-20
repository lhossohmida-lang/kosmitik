/**
 * تهيئة Firebase مرّة واحدة مع تخزين محلي دائم للعمل بلا إنترنت (offline-first).
 *
 * قواعد مهمّة:
 *  - نُهيّئ Firestore بـ persistentLocalCache على المتصفّح فقط (يحتاج IndexedDB).
 *  - على الحاسوب/الويب: persistentMultipleTabManager (عدة تبويبات).
 *  - على الهاتف (Capacitor): persistentSingleTabManager (تبويب واحد).
 *  - على الخادم (SSR/بناء): كاش في الذاكرة فقط، بلا IndexedDB.
 *  - نحفظ النسخة على globalThis حتى لا تتكرّر التهيئة مع إعادة تحميل التطوير.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  CACHE_SIZE_UNLIMITED,
  type Firestore,
} from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { supportsMultiTab } from './env';

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** true إذا لم تُملأ مفاتيح Firebase بعد (وضع Placeholders). */
export const firebaseConfigured =
  Boolean(firebaseConfig.apiKey) && firebaseConfig.apiKey !== 'REPLACE_ME';

type Cache = { app: FirebaseApp; db: Firestore; auth: Auth };
const g = globalThis as unknown as { __kosmitik?: Cache };

function init(): Cache {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  let db: Firestore;
  if (typeof window === 'undefined') {
    // الخادم: بلا تخزين دائم.
    db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  } else {
    // تنظيف الكاش القديم الكبير لتفادي خطأ QuotaExceededError الذي يعطّل Firestore
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('_suppliers_') || key.includes('_customers_') || key.includes('_preview_'))) {
          toRemove.push(key);
        }
      }
      toRemove.forEach(k => {
        const val = localStorage.getItem(k);
        // مسح إذا كان الحجم كبيراً جداً (أكثر من 50 ألف حرف) أو مسحه بالكامل لإعادة البناء
        if (val && val.length > 50000) {
          localStorage.removeItem(k);
        }
      });
    } catch (e) {}

    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        tabManager: supportsMultiTab()
          ? persistentMultipleTabManager()
          : persistentSingleTabManager(undefined),
      }),
    });
  }

  return { app, db, auth: getAuth(app) };
}

const cache: Cache = g.__kosmitik ?? (g.__kosmitik = init());

export const app = cache.app;
export const db = cache.db;
export const auth = cache.auth;
