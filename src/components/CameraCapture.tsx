'use client';

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';

/**
 * التقاط صورة بالكاميرا (للمنتجات). يفتح الكاميرا، وعند الضغط «التقط» يُعيد Blob
 * للصورة (يضغطها الأب لاحقاً). ينظّف الكاميرا دائماً عند الإغلاق.
 */
export default function CameraCapture({
  open,
  onCapture,
  onClose,
}: {
  open: boolean;
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError('');

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
      } catch {
        if (!cancelled) setError(t('cameraCapture.error'));
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCapture(blob);
          onClose();
        }
      },
      'image/jpeg',
      0.9,
    );
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 2100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <video
        ref={videoRef}
        style={{ width: 'min(92vw, 460px)', borderRadius: 12, background: '#000', aspectRatio: '4 / 3', objectFit: 'cover' }}
        muted
        playsInline
      />
      {error && <div style={{ color: '#fca5a5', marginTop: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
        <button className="btn" onClick={capture} disabled={!!error} style={{ fontSize: 17, padding: '12px 24px' }}>
          {t('cameraCapture.capture')}
        </button>
        <button className="btn" onClick={onClose} style={{ background: '#fff', color: '#000' }}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
