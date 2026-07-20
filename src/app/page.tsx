'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

/** الصفحة الجذر: تحويل تلقائي حسب حالة الدخول. */
export default function Home() {
  const router = useRouter();
  const { user, loading, configured } = useAuth();

  useEffect(() => {
    if (loading) return;
    // في وضع Placeholders (بلا مفاتيح) نذهب للدخول لعرض التنبيه.
    if (!configured || !user) router.replace('/login');
    else router.replace('/dashboard');
  }, [loading, user, configured, router]);

  return (
    <div
      style={{
        height: '100dvh',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--text-muted)',
      }}
    >
      جارٍ التحميل…
    </div>
  );
}
