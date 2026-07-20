/**
 * استيراد الأشخاص (زبائن الكريدي / الموردين) من Excel/CSV.
 * مطابقة أعمدة ذكية (عربي/فرنسي/إنجليزي) + كتابة على دفعات.
 */
import { writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';
import { col } from './paths';
import type { SheetData } from './sheet';
import type { CustomerGroup } from './types';

export type PersonField = 'name' | 'phone' | 'address' | 'debt' | 'notes' | 'products';
export type PersonKind = 'customer' | 'supplier';

const ALIASES: Record<PersonField, string[]> = {
  name: [
    'name', 'nom', 'client', 'clientname', 'suppliername', 'fournisseur', 'supplier',
    'customer', 'raisonsociale', 'اسم', 'الاسم', 'المورد', 'العميل', 'الزبون', 'اسمالعميل', 'اسمالمورد',
  ],
  phone: [
    'phone', 'tel', 'tele', 'telephone', 'mobile', 'gsm', 'portable', 'contact', 'fax',
    'هاتف', 'الهاتف', 'جوال', 'رقمالهاتف', 'تليفون', 'رقم',
  ],
  address: [
    'address', 'adresse', 'adr', 'ville', 'wilaya', 'commune', 'address1', 'address2', 'city',
    'عنوان', 'العنوان', 'المدينة', 'الولاية', 'البلدية',
  ],
  debt: [
    'debt', 'balance', 'account', 'initialaccount', 'solde', 'credit', 'creance', 'dette',
    'due', 'montant', 'reste', 'restant', 'impaye',
    'دين', 'رصيد', 'مبلغ', 'الدين', 'الرصيد', 'ذمة', 'باقي', 'المتبقي', 'الديون', 'الدَّين',
  ],
  notes: [
    'note', 'notes', 'remarque', 'remarques', 'observation',
    'ملاحظة', 'ملاحظات', 'تفاصيل',
  ],
  products: [
    'produits', 'articles', 'products', 'marchandise',
    'بضاعة', 'منتجات', 'السلعة', 'البضاعة', 'الصنف', 'اصناف', 'المنتجات', 'منتوجات',
    'اسماءالمنتجات', 'اسمالمنتج', 'اسماءالبضاعة', 'اسماءالاصناف',
    'productnames', 'itemnames', 'goods', 'items',
  ],
};

function norm(s: string): string {
  return (s || '')
    .replace(/﻿/g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s_\-.]/g, '');
}

export function detectPersonCols(headers: string[]): Partial<Record<PersonField, number>> {
  const normed = headers.map(norm);
  const map: Partial<Record<PersonField, number>> = {};
  (Object.keys(ALIASES) as PersonField[]).forEach((f) => {
    const al = ALIASES[f].map(norm);
    let idx = normed.findIndex((h) => al.includes(h));
    if (idx < 0) idx = normed.findIndex((h) => h && al.some((a) => h.includes(a)));
    if (idx >= 0) map[f] = idx;
  });
  return map;
}

function toNum(s: string | undefined): number {
  if (!s) return 0;
  const v = parseFloat(String(s).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
}

export interface PersonRecord {
  name: string;
  nameLower: string;
  phone: string;
  address: string;
  balance: number;
  notes: string;
  /** المنتجات/البضاعة (للموردين). */
  products: string;
}

export interface MapPeopleResult {
  records: PersonRecord[];
  stats: { total: number; ready: number; skippedDup: number; noName: number; withDebt: number };
  columns: Partial<Record<PersonField, number>>;
}

export function mapPeople(sheet: SheetData, opts: { existingNames?: Set<string> } = {}): MapPeopleResult {
  const c = detectPersonCols(sheet.headers);
  const records: PersonRecord[] = [];
  const stats = { total: sheet.rows.length, ready: 0, skippedDup: 0, noName: 0, withDebt: 0 };
  const seen = new Set<string>();

  for (const row of sheet.rows) {
    const get = (f: PersonField) => (c[f] != null ? (row[c[f]!] ?? '').trim() : '');
    const name = get('name');
    if (!name) { stats.noName++; continue; }
    const nl = name.toLowerCase();
    if (seen.has(nl) || opts.existingNames?.has(nl)) { stats.skippedDup++; continue; }
    seen.add(nl);
    const balance = toNum(get('debt'));
    if (balance > 0) stats.withDebt++;
    // تنظيف حقل المنتجات: نتجاهل القيم الرقمية البحتة (أعداد وليست أسماء)
    const rawProducts = get('products');
    const products = cleanProductNames(rawProducts);
    records.push({ name, nameLower: nl, phone: get('phone'), address: get('address'), balance, notes: get('notes'), products });
    stats.ready++;
  }
  return { records, stats, columns: c };
}

/**
 * تنظيف نص المنتجات المستورد:
 * - يُزيل الأجزاء الرقمية البحتة (مثل "3" أو "12.5" التي تمثّل أعداداً لا أسماء)
 * - يُبقي النصوص التي تحتوي أحرفاً (أسماء المنتجات الفعلية)
 * - يُوحّد الفواصل إلى «، »
 */
function cleanProductNames(raw: string): string {
  if (!raw) return '';
  // إذا كانت القيمة كلها رقمية → نتجاهلها
  if (/^[\d\s.,]+$/.test(raw)) return '';
  // تقسيم بالفواصل المختلفة
  const parts = raw.split(/[،,;؛\n|]+/);
  const cleaned = parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^[\d.]+$/.test(p)); // استبعاد الأرقام المنفردة
  return cleaned.join('، ');
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

/** يكتب السجلات على دفعات إلى customers أو suppliers. يتطلّب اتصالاً. */
export async function importPeopleBatched(
  storeId: string,
  kind: PersonKind,
  records: PersonRecord[],
  group: CustomerGroup,
  onProgress?: (done: number, total: number) => void,
): Promise<{ written: number; error?: string }> {
  const colName = kind === 'customer' ? ('customers' as const) : ('suppliers' as const);
  const now = Date.now();
  const CHUNK = 400;
  let written = 0;

  for (let i = 0; i < records.length; i += CHUNK) {
    const slice = records.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const r of slice) {
      const ref = doc(col(storeId, colName));
      if (kind === 'customer') {
        batch.set(ref, {
          name: r.name, nameLower: r.nameLower, phone: r.phone, address: r.address,
          balance: r.balance, group, creditLimit: 0, dueDate: null,
          createdAt: now, updatedAt: now,
        });
      } else {
        batch.set(ref, {
          name: r.name, nameLower: r.nameLower, phone: r.phone, address: r.address,
          balance: r.balance, notes: r.notes, products: r.products,
          createdAt: now, updatedAt: now,
        });
      }
    }
    try {
      await Promise.race([batch.commit(), timeout(30000)]);
    } catch {
      return { written, error: `توقّف الاستيراد بعد ${written}. تأكّد من الاتصال بالإنترنت وأعد المحاولة.` };
    }
    written += slice.length;
    onProgress?.(written, records.length);
  }
  return { written };
}
