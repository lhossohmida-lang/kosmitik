'use client';

/**
 * مُطبِّع لوحة المفاتيح: يجعل صفّ الأرقام يكتب أرقاماً (1234567890) دائماً
 * في كل خانات الإدخال — يعالج لوحة AZERTY حيث تظهر & é " ' ( - è _ ç à بدل الأرقام.
 *
 * نقرأ الرقم من المفتاح الفيزيائي (e.code = Digit/Numpad) وندرجه بدل الرمز.
 * هذا يُصلح قارئ USB والكتابة اليدوية للأرقام معاً في جميع الحقول.
 */
import { useEffect } from 'react';
import { digitFromCode } from '@/lib/barcode';

function insertDigit(el: HTMLInputElement | HTMLTextAreaElement, d: string) {
  const type = (el as HTMLInputElement).type;
  const supportsSelection = type !== 'number' && type !== 'email' && type !== 'date' && type !== 'time';

  let newValue: string;
  let caret: number | null = null;
  if (supportsSelection && el.selectionStart != null) {
    const start = el.selectionStart;
    const end = el.selectionEnd ?? start;
    newValue = el.value.slice(0, start) + d + el.value.slice(end);
    caret = start + 1;
  } else {
    newValue = (el.value ?? '') + d; // number/date… لا يدعم التحديد → إلحاق
  }

  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, newValue);
  else el.value = newValue;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (caret != null) {
    try {
      el.selectionStart = el.selectionEnd = caret;
    } catch {
      /* بعض الأنواع لا تدعم selection */
    }
  }
}

export default function KeyNormalizer() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const d = digitFromCode(e.code);
      if (!d) return; // ليس مفتاح رقم فيزيائي
      if (e.key === d) return; // أصلاً رقم (لا حاجة للتحويل)
      if (e.key.length !== 1) return; // مفاتيح تحكّم

      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;

      e.preventDefault();
      insertDigit(el as HTMLInputElement | HTMLTextAreaElement, d);
    }
    window.addEventListener('keydown', handler, true); // مرحلة الالتقاط
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  return null;
}
