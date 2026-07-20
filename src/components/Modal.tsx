'use client';

import { useEffect, type ReactNode } from 'react';
import { useLanguage } from '@/context/LanguageContext';

/**
 * نافذة React عامة — بديل آمن عن window.alert/confirm الذي يُجمّد WebView.
 * تُغلق بمفتاح Escape وبالنقر على الخلفية (مخرج طوارئ من أي نافذة عالقة).
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  width = 520,
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: number;
  closeOnBackdrop?: boolean;
}) {
  const { t } = useLanguage();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // منع تمرير الخلفية أثناء فتح النافذة.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.45)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        zIndex: 1000,
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: width,
          maxHeight: '90dvh',
          overflowY: 'auto',
          padding: 0,
        }}
      >
        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid var(--border)',
              position: 'sticky',
              top: 0,
              background: 'var(--surface)',
              zIndex: 1,
            }}
          >
            <h2 style={{ fontSize: 18 }}>{title}</h2>
            <button
              onClick={onClose}
              aria-label={t('common.close')}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: 22,
                lineHeight: 1,
                color: 'var(--text-muted)',
              }}
            >
              ×
            </button>
          </div>
        )}
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}
