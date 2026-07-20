'use client';

/**
 * Escape داخل أي خانة كتابة (فيها نصّ) يمحو محتواها كاملاً فوراً،
 * بدل إغلاق النافذة (نمسك الحدث في مرحلة الالتقاط لمنع إغلاق Modal/CameraScanner له).
 * إن كانت الخانة فارغة، نترك Escape يتصرّف عادياً (إغلاق نافذة مثلاً).
 */
import { useEffect } from 'react';

const EXCLUDED_TYPES = new Set(['checkbox', 'radio', 'file', 'range', 'color', 'submit', 'button', 'reset', 'image']);

function clearValue(el: HTMLInputElement | HTMLTextAreaElement) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, '');
  else el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export default function EscapeClear() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const el = document.activeElement as HTMLElement | null;
      if (!el) return;
      if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;

      const field = el as HTMLInputElement | HTMLTextAreaElement;
      const type = (field as HTMLInputElement).type ?? 'text';
      if (EXCLUDED_TYPES.has(type)) return;
      if (!field.value) return;

      e.preventDefault();
      e.stopPropagation();
      clearValue(field);
    }
    window.addEventListener('keydown', handler, true); // مرحلة الالتقاط
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  return null;
}
