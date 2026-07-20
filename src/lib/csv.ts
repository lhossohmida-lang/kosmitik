/**
 * تحليل CSV ومطابقة الأعمدة بذكاء — بلا أي اعتماد على Firebase (قابل للاختبار).
 * يُستخدم في استيراد المنتجات من تطبيق نقطة بيع آخر.
 */
import type { Product } from './types';

export type ImportField =
  | 'name' | 'sellPrice' | 'cost' | 'stock' | 'minStock'
  | 'barcode' | 'category' | 'unit' | 'inactive' | 'itemNo';

const FIELD_ALIASES: Record<ImportField, string[]> = {
  name: ['itemname', 'name', 'nom', 'designation', 'libelle', 'article', 'produit', 'product', 'اسم', 'المنتج', 'اسمالمنتج'],
  sellPrice: ['price', 'prix', 'pv', 'prixvente', 'sellprice', 'sell', 'pvente', 'ثمن', 'سعر', 'سعرالبيع', 'بيع'],
  cost: ['cost', 'cout', 'achat', 'prixachat', 'pa', 'buyprice', 'purchase', 'pachat', 'تكلفة', 'شراء', 'سعرالشراء'],
  stock: ['stock', 'qty', 'quantity', 'quantite', 'qte', 'كمية', 'مخزون', 'الكمية'],
  minStock: ['stockalert', 'alert', 'alerte', 'min', 'minstock', 'seuil', 'seuilalerte', 'حدأدنى', 'تنبيه'],
  barcode: ['barcode', 'codebarre', 'codebarres', 'code', 'ean', 'gencod', 'باركود', 'رمز', 'الباركود'],
  category: ['family', 'famille', 'category', 'categorie', 'rayon', 'group', 'groupe', 'فئة', 'صنف', 'عائلة', 'الفئة'],
  unit: ['unit', 'unite', 'u', 'mesure', 'وحدة'],
  inactive: ['inactive', 'disabled', 'desactive', 'archived', 'hidden', 'معطل', 'غيرنشط', 'موقوف'],
  itemNo: ['itemno', 'ref', 'reference', 'codearticle', 'مرجع'],
};

function norm(s: string): string {
  return (s || '')
    .replace(/﻿/g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // إزالة اللكنات é→e
    .replace(/[\s_\-.]/g, '');
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** محلّل CSV يدعم الاقتباس وكشف الفاصل تلقائياً (؛ أو ,) وإزالة BOM. */
export function parseCsv(text: string): ParsedCsv {
  text = text.replace(/^﻿/, '');
  const nl = text.indexOf('\n');
  const firstLine = nl >= 0 ? text.slice(0, nl) : text;
  const delim = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';

  const all: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); all.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); all.push(row); }

  const headers = (all.shift() ?? []).map((h) => h.trim());
  const rows = all.filter((r) => r.some((x) => x.trim() !== ''));
  return { headers, rows };
}

export function detectColumns(headers: string[]): Partial<Record<ImportField, number>> {
  const normed = headers.map(norm);
  const map: Partial<Record<ImportField, number>> = {};
  (Object.keys(FIELD_ALIASES) as ImportField[]).forEach((f) => {
    const aliases = FIELD_ALIASES[f].map(norm);
    let idx = normed.findIndex((h) => aliases.includes(h));
    if (idx < 0) idx = normed.findIndex((h) => aliases.some((a) => h.includes(a)));
    if (idx >= 0) map[f] = idx;
  });
  return map;
}

function toNum(s: string | undefined): number {
  if (!s) return 0;
  const v = parseFloat(String(s).replace(',', '.').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(v) ? v : 0;
}

function mapUnit(raw: string | undefined): string {
  const n = norm(raw || '');
  if (['kg', 'kilo', 'كغ', 'كيلو'].includes(n)) return 'كغ';
  if (['l', 'litre', 'liter', 'لتر'].includes(n)) return 'لتر';
  return 'قطعة';
}

const TRUE_SET = new Set(['1', 'true', 'yes', 'oui', 'vrai', 'x', 'نعم']);

export type NewProductDoc = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;

export interface MapOptions {
  skipInactive: boolean;
  existingNames?: Set<string>;
  existingBarcodes?: Set<string>;
}

export interface MapResult {
  products: NewProductDoc[];
  stats: {
    total: number;
    ready: number;
    skippedInactive: number;
    skippedDuplicate: number;
    noName: number;
    noPrice: number;
  };
  columns: Partial<Record<ImportField, number>>;
}

// ===== وضع المزامنة: تحديث كميات (وأسعار) المنتجات الموجودة + إضافة الجديد =====

/** تحديث لمنتج موجود: نغيّر فقط الحقول الموجودة في الملف. */
export interface ProductUpdate {
  id: string;
  name: string;
  fields: { stock?: number; unitSellPrice?: number; unitPurchasePrice?: number; minStock?: number };
}

export interface SyncResult {
  updates: ProductUpdate[];
  creates: NewProductDoc[];
  stats: { total: number; toUpdate: number; toCreate: number; noName: number };
  columns: Partial<Record<ImportField, number>>;
}

/**
 * يطابق صفوف الملف مع المنتجات الموجودة (بالباركود أولاً ثم بالاسم):
 *  - موجود → تحديث كميته (والسعر/التكلفة/الحد الأدنى إن كانت أعمدتها في الملف).
 *  - غير موجود → منتج جديد يُضاف.
 * كمية الملف تُعتبر **الكمية الجديدة المطلقة** (استبدال، لا إضافة).
 */
export function mapSync(
  parsed: ParsedCsv,
  existing: Pick<Product, 'id' | 'name' | 'nameLower' | 'barcodes'>[],
  opts?: { skipInactive?: boolean },
): SyncResult {
  const c = detectColumns(parsed.headers);
  const byBarcode = new Map<string, Pick<Product, 'id' | 'name'>>();
  const byName = new Map<string, Pick<Product, 'id' | 'name'>>();
  for (const p of existing) {
    if (p.nameLower) byName.set(p.nameLower, p);
    for (const b of p.barcodes || []) { const t = (b || '').trim(); if (t) byBarcode.set(t, p); }
  }

  const updates: ProductUpdate[] = [];
  const creates: NewProductDoc[] = [];
  const stats = { total: parsed.rows.length, toUpdate: 0, toCreate: 0, noName: 0 };
  const seenUpdate = new Set<string>();
  const seenNewNames = new Set<string>();
  const seenNewBc = new Set<string>();

  const hasStock = c.stock != null;
  const hasSell = c.sellPrice != null;
  const hasCost = c.cost != null;
  const hasMin = c.minStock != null;

  for (const row of parsed.rows) {
    const get = (f: ImportField) => (c[f] != null ? (row[c[f]!] ?? '').trim() : '');
    const name = get('name');
    if (!name) { stats.noName++; continue; }
    if (opts?.skipInactive && c.inactive != null && TRUE_SET.has((row[c.inactive]! ?? '').trim().toLowerCase())) continue;

    const barcode = get('barcode');
    const nameLower = name.toLowerCase();

    let match = barcode ? byBarcode.get(barcode) : undefined;
    if (!match) match = byName.get(nameLower);

    if (match) {
      if (seenUpdate.has(match.id)) continue; // صفّ مكرّر لنفس المنتج
      const fields: ProductUpdate['fields'] = {};
      if (hasStock) fields.stock = toNum(get('stock'));
      if (hasSell) { const v = toNum(get('sellPrice')); if (v > 0) fields.unitSellPrice = v; }
      if (hasCost) { const v = toNum(get('cost')); if (v > 0) fields.unitPurchasePrice = v; }
      if (hasMin) fields.minStock = toNum(get('minStock'));
      if (Object.keys(fields).length === 0) continue;
      updates.push({ id: match.id, name: match.name, fields });
      seenUpdate.add(match.id);
      stats.toUpdate++;
    } else {
      if (seenNewNames.has(nameLower) || (barcode && seenNewBc.has(barcode))) continue;
      seenNewNames.add(nameLower);
      if (barcode) seenNewBc.add(barcode);
      creates.push({
        name,
        nameLower,
        category: get('category'),
        barcodes: barcode ? [barcode] : [],
        type: 'unit',
        unitPurchasePrice: toNum(get('cost')),
        unitSellPrice: toNum(get('sellPrice')),
        stock: toNum(get('stock')),
        minStock: toNum(get('minStock')),
        unit: mapUnit(get('unit')),
        expiry: null,
        quickAccess: false,
        image: '',
      });
      stats.toCreate++;
    }
  }

  return { updates, creates, stats, columns: c };
}

/** يحوّل صفوف CSV إلى مستندات منتجات جاهزة + إحصاءات. */
export function mapRows(parsed: ParsedCsv, opts: MapOptions): MapResult {
  const c = detectColumns(parsed.headers);
  const products: NewProductDoc[] = [];
  const stats = { total: parsed.rows.length, ready: 0, skippedInactive: 0, skippedDuplicate: 0, noName: 0, noPrice: 0 };
  const seenNames = new Set<string>();
  const seenBarcodes = new Set<string>();

  for (const row of parsed.rows) {
    const get = (f: ImportField) => (c[f] != null ? (row[c[f]!] ?? '').trim() : '');

    const name = get('name');
    if (!name) { stats.noName++; continue; }

    if (opts.skipInactive && c.inactive != null && TRUE_SET.has((row[c.inactive]! ?? '').trim().toLowerCase())) {
      stats.skippedInactive++;
      continue;
    }

    const nameLower = name.toLowerCase();
    const barcode = get('barcode');

    const dupName = seenNames.has(nameLower) || Boolean(opts.existingNames?.has(nameLower));
    const dupBc = barcode ? seenBarcodes.has(barcode) || Boolean(opts.existingBarcodes?.has(barcode)) : false;
    if (dupName || dupBc) { stats.skippedDuplicate++; continue; }

    const sellPrice = toNum(get('sellPrice'));
    if (sellPrice <= 0) stats.noPrice++;

    seenNames.add(nameLower);
    if (barcode) seenBarcodes.add(barcode);

    products.push({
      name,
      nameLower,
      category: get('category'),
      barcodes: barcode ? [barcode] : [],
      type: 'unit',
      unitPurchasePrice: toNum(get('cost')),
      unitSellPrice: sellPrice,
      stock: toNum(get('stock')),
      minStock: toNum(get('minStock')),
      unit: mapUnit(get('unit')),
      expiry: null,
      quickAccess: false,
      image: '',
    });
    stats.ready++;
  }

  return { products, stats, columns: c };
}
