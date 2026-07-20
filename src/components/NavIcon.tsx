'use client';

import { useState } from 'react';

/**
 * أيقونة تنقّل: تعرض صورة ثلاثية الأبعاد (PNG) إن وُجدت، وإلا تسقط تلقائياً
 * إلى رمز emoji — فلا تظهر صورة مكسورة قبل توليد الأيقونات.
 */
export default function NavIcon({
  img,
  emoji,
  size,
}: {
  img?: string;
  emoji: string;
  size: number;
}) {
  const [failed, setFailed] = useState(false);

  if (img && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={img}
        alt=""
        onError={() => setFailed(true)}
        style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
      />
    );
  }
  return <span style={{ fontSize: Math.round(size * 0.82), lineHeight: 1 }}>{emoji}</span>;
}
