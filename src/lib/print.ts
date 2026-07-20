/**
 * الطباعة:
 *  - وصل بيع 72mm واضح (خط كبير أسود عريض، أرقام لاتينية بلا قصّ).
 *  - ملصق منتج 40×20mm (الاسم + باركود CODE128 قابل للمسح + الرقم).
 * على Electron: طباعة حرارية صامتة بمقاس مضبوط عبر IPC؛ وإلا حوار طباعة المتصفح.
 */
import { branding } from './branding';
import { code128Svg } from './barcode128';
import type { Product, Sale } from './types';

/** أرقام لاتينية واضحة للوصولات (تجنّب فواصل ar-DZ التي تُطبع رموزاً غريبة). */
const money = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2);

function receiptHtml(sale: Sale): string {
  const d = new Date(sale.createdAt);
  const date = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const rows = sale.items
    .map(
      (it) => `
      <tr>
        <td class="name">${escapeHtml(it.name)}</td>
        <td class="qty">${it.qty}</td>
        <td class="num">${money(it.unitSellPrice)}</td>
        <td class="num">${money(it.lineTotal)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
  <style>
    @page { size: 72mm auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; }
    /* width:100% → يتأقلم مع عرض ورق الطابعة (80mm أو 58mm) بدل عرضٍ ثابت يُقصّ. */
    body { width:100%; max-width:80mm; margin:0 auto; padding:1.5mm; font-family:'Segoe UI',Tahoma,Arial,sans-serif;
           color:#000; font-weight:800; -webkit-print-color-adjust:exact; }
    .center { text-align:center; }
    .store { font-size:24px; font-weight:900; letter-spacing:1px; }
    .muted { font-size:13px; font-weight:700; margin-top:1px; }
    hr { border:none; border-top:2px dashed #000; margin:6px 0; }
    table { width:100%; table-layout:fixed; border-collapse:collapse; font-size:14px; }
    th { font-size:12px; border-bottom:1.5px solid #000; padding-bottom:2px; }
    th, td { padding:3px 1px; text-align:right; vertical-align:top; }
    .name { width:42%; word-wrap:break-word; line-height:1.25; }
    .qty { width:12%; text-align:center; }
    .num, th.numh { width:23%; text-align:left; direction:ltr; white-space:nowrap; }
    .totals { margin-top:4px; border-top:2px solid #000; padding-top:4px; }
    .line { display:flex; justify-content:space-between; align-items:baseline; font-size:15px; padding:1px 0; }
    .grand { font-size:22px; font-weight:900; }
    .amount { direction:ltr; unicode-bidi:isolate; white-space:nowrap; }
    .foot { font-size:13px; font-weight:700; margin-top:8px; }
  </style></head><body>
    <div class="center store">${escapeHtml(branding.storeName)}</div>
    ${branding.phone ? `<div class="center muted">${escapeHtml(branding.phone)}</div>` : ''}
    <div class="center muted" dir="ltr">${date}</div>
    <hr/>
    <table>
      <thead><tr><th class="name">الصنف</th><th class="qty">كمية</th><th class="numh">سعر</th><th class="numh">إجمالي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      ${sale.discount > 0 ? `<div class="line"><span>المجموع</span><span class="amount">${money(sale.subtotal)}</span></div>
      <div class="line"><span>الخصم</span><span class="amount">-${money(sale.discount)}</span></div>` : ''}
      <div class="line grand"><span>الإجمالي</span><span class="amount">${money(sale.total)} د.ج</span></div>
    </div>
    <div class="center muted" style="margin-top:5px">${sale.payment === 'credit' ? 'كريدي' : 'نقدي'}${sale.customerName ? ' — ' + escapeHtml(sale.customerName) : ''}</div>
    <hr/>
    <div class="center foot">شكراً لزيارتكم</div>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

interface PrintExtra {
  widthMicrons?: number;
  heightMicrons?: number;
  kind?: string;
}
interface ElectronAPI {
  printReceipt?: (html: string, heightPx: number, extra?: PrintExtra) => void;
}
function electron(): ElectronAPI | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { electronAPI?: ElectronAPI }).electronAPI ?? null;
}

export interface PrintOptions {
  /** عرض الورقة بالمليمتر (افتراضي 72 للوصل الحراري). */
  widthMm?: number;
  /** ارتفاع ثابت بالمليمتر (للملصقات)؛ إن غاب يُقاس من المحتوى. */
  heightMm?: number;
  /** نوع الطباعة ('label' يسمح بتوجيهها لطابعة ملصقات عبر POS_LABEL_PRINTER_NAME). */
  kind?: string;
}

/**
 * طباعة أي HTML عبر iframe مخفي.
 * - على Electron: طباعة صامتة بمقاس مضبوط (72mm وصل / مقاس مخصّص للملصقات).
 * - غير ذلك: حوار طباعة المتصفح (مع @page داخل الـ HTML لضبط المقاس).
 */
export function printHtml(html: string, opts?: PrintOptions): void {
  if (typeof document === 'undefined') return;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const idoc = iframe.contentWindow?.document;
  if (!idoc) {
    document.body.removeChild(iframe);
    return;
  }
  idoc.open();
  idoc.write(html);
  idoc.close();

  const win = iframe.contentWindow!;
  const cleanup = () => setTimeout(() => iframe.parentNode && document.body.removeChild(iframe), 1000);

  setTimeout(() => {
    const api = electron();
    if (api?.printReceipt) {
      const height = Math.ceil(idoc.body.getBoundingClientRect().height);
      api.printReceipt(html, height, {
        widthMicrons: opts?.widthMm ? Math.round(opts.widthMm * 1000) : undefined,
        heightMicrons: opts?.heightMm ? Math.round(opts.heightMm * 1000) : undefined,
        kind: opts?.kind,
      });
      cleanup();
      return;
    }
    win.onafterprint = cleanup;
    try {
      win.focus();
      win.print();
    } catch {
      /* تجاهل */
    }
    cleanup();
  }, 250);
}

/** طباعة وصل بيع (72mm). */
export function printReceipt(sale: Sale): void {
  printHtml(receiptHtml(sale));
}

/**
 * طباعة ملصق منتج 40×20mm: اسم المنتج + باركود CODE128 + الرقم تحته
 * (مثل ملصقات المتاجر تماماً). إن لم يكن للمنتج باركود يُطبع الاسم والسعر فقط.
 */
export function printProductLabel(product: Pick<Product, 'name' | 'barcodes' | 'unitSellPrice'>): void {
  const barcode = (product.barcodes && product.barcodes[0]) || '';
  const svg = barcode ? code128Svg(barcode, 30) : null;

  const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8">
  <style>
    @page { size: 40mm 20mm; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { width:40mm; height:20mm; overflow:hidden; display:flex; flex-direction:column;
           align-items:center; justify-content:center; gap:0.4mm; padding:0.8mm 1mm;
           font-family:'Segoe UI',Tahoma,Arial,sans-serif; color:#000; -webkit-print-color-adjust:exact; }
    .name { font-size:7pt; font-weight:800; text-align:center; line-height:1.15;
            max-height:6.5mm; overflow:hidden; width:100%; }
    .bars { width:36mm; height:${svg ? 8 : 0}mm; }
    .bars svg { width:100%; height:100%; display:block; }
    .code { font-size:7.5pt; font-weight:700; letter-spacing:1.5px; direction:ltr; }
    .price { font-size:9pt; font-weight:900; direction:ltr; }
  </style></head><body>
    <div class="name">${escapeHtml(product.name)}</div>
    ${svg ? `<div class="bars">${svg}</div><div class="code">${escapeHtml(barcode)}</div>`
          : `<div class="price">${money(product.unitSellPrice)} د.ج</div>`}
  </body></html>`;

  printHtml(html, { widthMm: 40, heightMm: 20, kind: 'label' });
}
