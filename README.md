# KOSMITIK — نقطة بيع وإدارة مخزون

تطبيق نقطة بيع (POS) وإدارة مخزون لمحل تجاري، بكود **Next.js واحد** يُبنى لثلاثة أهداف:

- **الويب** (تطوير سريع في المتصفح).
- **الحاسوب (Windows / EXE)** عبر Electron — لاحقاً.
- **الهاتف (Android / APK)** عبر Capacitor — لاحقاً.

عربي RTL بالكامل · يعمل **بلا إنترنت** (offline-first) ويتزامن لحظياً عبر Firebase Firestore ·
عزل كامل لكل محل تحت `stores/{storeId}/...`.

---

## التشغيل السريع (تطوير)

```bash
npm install
npm run dev
```

ثم افتح <http://localhost:3000>.

> قبل ضبط مفاتيح Firebase سيعمل التطبيق ويُقلع، لكن **الدخول والمزامنة لن يعملا**
> وستظهر لك رسالة تنبيه في صفحة الدخول.

---

## إعداد Firebase (خطوة بخطوة)

1. اذهب إلى <https://console.firebase.google.com> وأنشئ **مشروعاً جديداً** (مجّاني).
2. من **Build → Authentication → Sign-in method** فعّل **Email/Password**.
3. من **Build → Firestore Database** أنشئ قاعدة بيانات (وضع Production مقبول؛ سنضبط القواعد لاحقاً).
4. من **⚙️ Project settings → Your apps** أضف تطبيق **Web** (أيقونة `</>`).
5. انسخ قيم `firebaseConfig` الستّة إلى ملف **`.env.local`** (موجود بقيم `REPLACE_ME`):

   | متغيّر `.env.local`                        | مفتاح firebaseConfig |
   | ------------------------------------------ | -------------------- |
   | `NEXT_PUBLIC_FIREBASE_API_KEY`             | `apiKey`             |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | `authDomain`         |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          | `projectId`          |
   | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      | `storageBucket`      |
   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId`  |
   | `NEXT_PUBLIC_FIREBASE_APP_ID`              | `appId`              |

6. أعد تشغيل `npm run dev`. الآن يمكنك **إنشاء محل جديد** (حساب) وتسجيل الدخول.

> **أمان:** `.env.local` و`.env.production` مُستثناة في `.gitignore` ولا تُرفع إلى git.

---

## بنية المشروع

```
src/
├── app/
│   ├── layout.tsx            # الجذر: RTL + مزوّد المصادقة
│   ├── page.tsx              # تحويل حسب حالة الدخول
│   ├── login/                # تسجيل الدخول / إنشاء محل
│   └── (app)/                # الصفحات المحميّة (خلف الدخول)
│       ├── layout.tsx        # الهيكل المتجاوب (Sidebar/TopBar/BottomNav)
│       ├── dashboard/  pos/  products/  credits/
│       └── purchases/  reports/  cash/  expenses/
├── components/               # Sidebar · TopBar · BottomNav · OnlineIndicator · Placeholder
├── context/AuthContext.tsx   # حالة الدخول + storeId (=uid)
└── lib/
    ├── firebase.ts           # تهيئة Firebase + كاش دائم (offline)
    ├── branding.ts           # اسم المتجر · العملة · الألوان
    ├── paths.ts              # مسارات stores/{storeId}/...
    ├── nav.ts                # عناصر التنقّل المشتركة
    └── env.ts                # كشف Electron/Capacitor/Web
```

## التغليف

### حاسوب Windows (EXE)
```bash
npm run electron        # تجربة نسخة سطح المكتب على خادم التطوير (شغّل npm run dev أولاً)
npm run build:desktop   # يبني Next standalone + ينسخ الأصول + يغلّف EXE عبر electron-builder → dist-electron/
```
> يشغّل Electron خادم Next المستقل داخلياً (لا يحتاج إنترنت للواجهة). الطباعة الحرارية
> صامتة مع اكتشاف الطابعة تلقائياً (xp/pos/80…) أو عبر `POS_PRINTER_NAME`.

### هاتف Android (APK)
```bash
npm run android:init    # أول مرة فقط: يبني تصدير Capacitor + ينشئ مجلد android/
# ثم انسخ firebase/google-services.json إلى android/app/  (اختياري — راجع firebase/README.md)
npm run android:apk     # يبني ويزامن ويولّد APK عبر Gradle (يتطلب Android SDK + JDK)
```
> `appId` = `KOSMITIK.app` (مطابق لاسم الحزمة المسجّل). بناء APK يتطلب Android Studio / SDK مثبّتاً.

## ملاحظات
- **الصفحات المالية** (التقارير، صندوق النقود) محميّة بكلمة سر — الافتراضية `1234`،
  غيّرها عبر `NEXT_PUBLIC_APP_PASSWORD` في `.env.local`.
- **المساعد الذكي** (اختياري): أضِف `NEXT_PUBLIC_OPENROUTER_API_KEY`.
- كل الاستعلامات مصمّمة لتفادي الحاجة لفهارس Firestore مركّبة (تعمل مباشرة).
