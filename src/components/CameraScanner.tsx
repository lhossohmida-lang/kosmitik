'use client';

/**
 * ماسح باركود بالكاميرا للويب/الحاسوب — سريع جداً.
 *  - يستخدم BarcodeDetector الأصلي في المتصفّح (فحص لكل إطار عبر requestAnimationFrame)
 *    فيقرأ الباركود لحظة ظهوره تقريباً. متوفّر في Chrome/Edge وWebView الحديثة.
 *  - إن لم يتوفّر → ZXing كبديل بمحاولات متواصلة (delay=0).
 *  - على الهاتف (Capacitor) الماسح الأساسي هو ML Kit؛ هذا احتياطي.
 * تغذية راجعة: بيب + اهتزاز. تنظيف دائم للكاميرا عند الإغلاق (تفادي التجمّد).
 */
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 80);
  } catch {
    /* الصوت غير حرج */
  }
}

function vibrate() {
  try {
    navigator.vibrate?.(50);
  } catch {
    /* الاهتزاز غير حرج */
  }
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

async function applyContinuousFocus(stream: MediaStream) {
  try {
    const track = stream.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as { focusMode?: string[] } | undefined;
    if (track && caps?.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet] });
    }
  } catch {
    /* غير حرج */
  }
}

export default function CameraScanner({
  open,
  onScan,
  onClose,
  continuous = false,
}: {
  open: boolean;
  onScan: (code: string) => void;
  onClose: () => void;
  continuous?: boolean;
}) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<() => void>(() => {});
  const lastCodeRef = useRef<string>('');
  const lastTimeRef = useRef<number>(0);
  const [error, setError] = useState('');
  const [lastScanned, setLastScanned] = useState('');
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let rafId = 0;
    let stream: MediaStream | null = null;
    setError('');
    setLastScanned('');
    setCount(0);

    const handle = (text: string) => {
      if (!text) return;
      const now = Date.now();
      if (text === lastCodeRef.current && now - lastTimeRef.current < 1200) return;
      lastCodeRef.current = text;
      lastTimeRef.current = now;
      beep();
      vibrate();
      if (continuous) {
        setLastScanned(text);
        setCount((c) => c + 1);
        onScan(text);
      } else {
        stopRef.current();
        onScan(text);
        onClose();
      }
    };

    (async () => {
      try {
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: unknown) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;

        // BarcodeDetector أصلي وسريع → دقّة عالية. غير متوفّر (مثل ويندوز) → ZXing:
        // نُصغّر الدقّة لأنّ فك التشفير على إطار أصغر أسرع بكثير (استجابة شبه فورية).
        const res = BD ? { width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1024 }, height: { ideal: 768 } };
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, ...res },
        });
        if (cancelled) {
          stopStream(stream);
          return;
        }
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play().catch(() => {});
        void applyContinuousFocus(stream);

        if (BD) {
          // المسار السريع: فحص أصلي لكل إطار.
          const detector = new BD({ formats: FORMATS });
          const tick = async () => {
            if (cancelled) return;
            try {
              const codes = await detector.detect(video);
              if (codes && codes.length) handle(codes[0].rawValue);
            } catch {
              /* تجاهل إطاراً فاشلاً */
            }
            if (!cancelled) rafId = requestAnimationFrame(tick);
          };
          stopRef.current = () => {
            cancelled = true;
            cancelAnimationFrame(rafId);
            stopStream(stream);
          };
          rafId = requestAnimationFrame(tick);
        } else {
          // بديل ZXing بمحاولات متواصلة.
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
          const hints = new Map();
          hints.set(DecodeHintType.TRY_HARDER, true);
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE, BarcodeFormat.ITF,
          ]);
          const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 0, delayBetweenScanSuccess: 300 });
          const controls = await reader.decodeFromStream(stream, video, (result: unknown) => {
            if (result) handle((result as { getText: () => string }).getText());
          });
          stopRef.current = () => {
            cancelled = true;
            controls.stop();
            stopStream(stream);
          };
        }
      } catch {
        if (!cancelled) setError(t('cameraScanner.error'));
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stopRef.current();
      stopStream(stream);
    };
  }, [open, continuous, onScan, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="scanner-ui"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{ position: 'relative', width: 'min(92vw, 480px)' }}>
        <video
          ref={videoRef}
          style={{ width: '100%', borderRadius: 12, background: '#000', aspectRatio: '4 / 3', objectFit: 'cover' }}
          muted
          playsInline
        />
        <div
          style={{
            position: 'absolute',
            inset: '30% 8%',
            border: '3px solid rgba(255,255,255,0.9)',
            borderRadius: 12,
            boxShadow: '0 0 0 100vmax rgba(0,0,0,0.2)',
            pointerEvents: 'none',
          }}
        />
      </div>

      <div style={{ color: '#fff', marginTop: 16, textAlign: 'center', minHeight: 24 }}>
        {error ? (
          <span style={{ color: '#fca5a5' }}>{error}</span>
        ) : continuous ? (
          <span>
            {t('cameraScanner.bringCloser')} <b>{count}</b>
            {lastScanned && (
              <span dir="ltr" style={{ display: 'block', opacity: 0.8, fontSize: 13 }}>
                {t('cameraScanner.lastCode')} {lastScanned}
              </span>
            )}
          </span>
        ) : (
          <span>{t('cameraScanner.bringCloserOnce')}</span>
        )}
      </div>

      <button onClick={onClose} className="btn" style={{ marginTop: 16, background: '#fff', color: '#000' }}>
        {continuous ? t('cameraScanner.finish') : t('common.close')}
      </button>
    </div>
  );
}
