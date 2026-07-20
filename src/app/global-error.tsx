'use client';

/** حاجز أخطاء على مستوى الجذر (يزيل class الكاميرا العالق ويتيح إعادة المحاولة). */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  if (typeof document !== 'undefined') document.body.classList.remove('barcode-scanner-active');
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "'Segoe UI',Tahoma,sans-serif", display: 'grid', placeItems: 'center', height: '100dvh', margin: 0 }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 44 }}>⚠️</div>
          <h2>حدث خطأ</h2>
          <button
            onClick={() => reset()}
            style={{ marginTop: 12, padding: '10px 20px', border: 'none', borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 700 }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
