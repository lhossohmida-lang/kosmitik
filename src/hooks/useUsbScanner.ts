'use client';

/**
 * كشف قارئ الباركود USB (محاكاة لوحة مفاتيح).
 * القارئ يكتب الحروف بسرعة كبيرة (< maxGapMs بين الحروف) وينهيها بـ Enter،
 * بخلاف الإنسان. نبني الكود من المفتاح الفيزيائي (e.code) لتفادي مشكلة AZERTY.
 *
 * يعمل عالمياً بصرف النظر عن التركيز — مناسب لنقطة البيع وصفحة المنتجات.
 */
import { useEffect, useRef } from 'react';
import { digitFromCode, smartBarcodeConvert } from '@/lib/barcode';

interface Options {
  onScan: (code: string) => void;
  enabled?: boolean;
  /** أقصى فجوة زمنية (ms) بين حرفين لاعتبارهما من القارئ. */
  maxGapMs?: number;
  /** أقل طول للكود حتى يُقبل كباركود. */
  minLength?: number;
}

export function useUsbScanner({
  onScan,
  enabled = true,
  maxGapMs = 50,
  minLength = 3,
}: Options) {
  const buf = useRef('');
  const last = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    function handler(e: KeyboardEvent) {
      const now =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      const gap = now - last.current;
      last.current = now;

      // فجوة كبيرة = بداية تسلسل جديد (على الأرجح كتابة بشرية).
      if (gap > maxGapMs) buf.current = '';

      if (e.key === 'Enter') {
        const raw = buf.current;
        buf.current = '';
        if (raw.length >= minLength) {
          e.preventDefault();
          e.stopPropagation();
          onScanRef.current(smartBarcodeConvert(raw));
        }
        return;
      }

      // الأولوية للرقم الفيزيائي (الأدق على AZERTY).
      const d = digitFromCode(e.code);
      if (d) {
        buf.current += d;
        // نمنع تسرّب الرقم للحقل فقط داخل تدفّق سريع (قارئ)، لا أثناء الكتابة اليدوية.
        if (gap <= maxGapMs && buf.current.length > 1) e.preventDefault();
        return;
      }

      // حروف الباركود (Code128/39): استعمل e.key إن كان حرفاً مفرداً مطبوعاً.
      if (e.key.length === 1) {
        buf.current += e.key;
      }
    }

    window.addEventListener('keydown', handler, true); // مرحلة الالتقاط
    return () => window.removeEventListener('keydown', handler, true);
  }, [enabled, maxGapMs, minLength]);
}
