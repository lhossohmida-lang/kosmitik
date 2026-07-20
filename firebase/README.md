# ملفات إعداد Firebase للمنصّات الأصلية

## google-services.json (أندرويد)

مُخزَّن هنا مؤقّتاً. **لا تضعه داخل `android/` الآن** — هذا المجلد يولّده Capacitor
في الخطوة 10، ووجوده مسبقاً يمنع `npx cap add android`.

عند تغليف نسخة أندرويد (الخطوة 10):

1. `npx cap add android`  (يولّد مجلد `android/`)
2. انسخ هذا الملف إلى: `android/app/google-services.json`
3. تأكّد أن `appId` في `capacitor.config.ts` = **`KOSMITIK.app`** (اسم الحزمة المسجّل).

> ملاحظة معماريّة: تطبيقنا يشغّل **Firebase JS SDK (الويب)** داخل WebView، ويستعمل
> مفاتيح `NEXT_PUBLIC_FIREBASE_*` من `.env.local`. لذلك `google-services.json`
> ليس ضرورياً إلّا إذا أضفنا إضافات Firebase أصلية (إشعارات Push، Crashlytics…).
> ماسح الباركود ML Kit لا يحتاجه. نحتفظ به جاهزاً احتياطاً.
