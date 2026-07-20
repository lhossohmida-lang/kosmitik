/**
 * أنواع البيانات المشتركة + دوال حساب المنتجات.
 * كل الأسعار تُخزَّن **بالوحدة** لتوحيد الحسابات (حتى في نوع الكرتونة).
 */

export type ProductType = 'carton' | 'unit';

export interface Product {
  id: string;
  name: string;
  /** نسخة صغيرة الأحرف للبحث ومنع التكرار. */
  nameLower: string;
  category: string;
  /** باركود واحد أو أكثر. */
  barcodes: string[];
  type: ProductType;

  // خاص بنوع «كرتونة → وحدة»
  /** عدد الوحدات في الكرتونة (لنوع carton فقط). */
  unitsPerCarton?: number;
  /** سعر شراء الكرتونة كما أُدخِل (مرجع لنوع carton). */
  cartonPurchasePrice?: number;

  /** سعر شراء الوحدة (محسوب للكرتونة، مباشر للوحدة). المتوسط المرجّح يحدّثه لاحقاً. */
  unitPurchasePrice: number;
  /** سعر بيع الوحدة. */
  unitSellPrice: number;

  /** المخزون بالوحدات دائماً. */
  stock: number;
  /** حد التنبيه على النقص (بالوحدات). */
  minStock: number;
  /** وحدة القياس المعروضة: قطعة/كغ/لتر… */
  unit: string;
  /** تاريخ الصلاحية ISO (اختياري). */
  expiry?: string | null;
  /** ظهور المنتج كزرّ اختصار سريع في نقطة البيع (يُخصَّص من المخزون — الخطوة 7). */
  quickAccess?: boolean;
  /** صورة المنتج مضغوطة بقوّة (data URL JPEG صغير جداً)، أو '' بلا صورة. */
  image?: string;

  createdAt: number;
  updatedAt: number;
}

export interface PublicProduct {
  id: string;
  name: string;
  nameLower: string;
  category: string;
  unitSellPrice: number;
  stock: number;
  unit: string;
  image?: string;
  updatedAt: number;
  /** updatedAt للمنتج المصدر — للمزامنة الفارقة (نكتب فقط ما تغيّر، توفيراً لحصّة الكتابة). */
  srcUpdatedAt?: number;
}

export type StoreOrderStatus = 'new' | 'accepted' | 'done' | 'cancelled';

export interface StoreOrderItem {
  productId: string;
  name: string;
  qty: number;
  unitSellPrice: number;
  lineTotal: number;
  image?: string;
}

export interface StoreOrder {
  id: string;
  customerName: string;
  phone: string;
  address?: string;
  note?: string;
  items: StoreOrderItem[];
  subtotal: number;
  total: number;
  status: StoreOrderStatus;
  saleId?: string | null;
  createdAt: number;
  updatedAt: number;
}

/** وحدات القياس الشائعة (لقائمة منسدلة). */
export const UNITS = ['قطعة', 'كغ', 'لتر', 'علبة', 'كيس', 'حزمة'] as const;

/** هامش الربح % = (بيع − شراء الوحدة) ÷ بيع × 100. آمن ضد القسمة على صفر. */
export function profitMargin(unitSellPrice: number, unitPurchasePrice: number): number {
  if (!unitSellPrice || unitSellPrice <= 0) return 0;
  return ((unitSellPrice - unitPurchasePrice) / unitSellPrice) * 100;
}

/** سعر شراء الوحدة من سعر الكرتونة: سعر الكرتونة ÷ عدد الوحدات. */
export function unitPriceFromCarton(cartonPrice: number, unitsPerCarton: number): number {
  if (!unitsPerCarton || unitsPerCarton <= 0) return 0;
  return cartonPrice / unitsPerCarton;
}

/** حالة مخزون المنتج لأغراض التنبيه. */
export function stockStatus(p: Product): 'out' | 'low' | 'ok' {
  if (p.stock <= 0) return 'out';
  if (p.minStock > 0 && p.stock <= p.minStock) return 'low';
  return 'ok';
}

/** هل المنتج قرب انتهاء الصلاحية (خلال days يوماً، وليس منتهياً منذ زمن بعيد)؟ */
export function isNearExpiry(p: Product, days = 30): boolean {
  if (!p.expiry) return false;
  const t = new Date(p.expiry).getTime();
  if (Number.isNaN(t)) return false;
  const now = Date.now();
  const limit = now + days * 24 * 3600 * 1000;
  return t <= limit; // يشمل المنتهي فعلاً
}

/** صياغة عربية لعدد الكراتين (0/1/2/جمع). */
function arabicCartons(n: number): string {
  if (n <= 0) return '';
  if (n === 1) return 'كرتونة واحدة';
  if (n === 2) return 'كرتونتان';
  if (n <= 10) return `${n} كراتين`;
  return `${n} كرتونة`;
}

/**
 * نص عرض المخزون. لنوع الكرتونة:
 *   47 وحدة (≈ كرتونتان + 23)
 * لنوع الوحدة:
 *   47 وحدة
 */
export function stockDisplay(p: Product): string {
  const units = Math.max(0, Math.floor(p.stock));
  const base = `${units} وحدة`;
  if (p.type !== 'carton' || !p.unitsPerCarton || p.unitsPerCarton <= 0) return base;

  const cartons = Math.floor(units / p.unitsPerCarton);
  const rem = units % p.unitsPerCarton;
  if (cartons <= 0) return base;

  const cartonsText = arabicCartons(cartons);
  const remText = rem > 0 ? ` + ${rem}` : '';
  return `${base} (≈ ${cartonsText}${remText})`;
}

// ==================== المبيعات ====================

export type PaymentMode = 'cash' | 'credit';

export interface SaleItem {
  productId: string;
  name: string;
  qty: number;
  /** سعر بيع الوحدة وقت البيع (قد يُعدَّل يدوياً في السلّة). */
  unitSellPrice: number;
  /** تكلفة شراء الوحدة وقت البيع — تُلتقط لتقارير رأس المال والربح. */
  unitPurchasePrice: number;
  /** إجمالي السطر بعد أي تعديل. */
  lineTotal: number;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  payment: PaymentMode;
  customerId?: string | null;
  customerName?: string | null;
  createdAt: number;
  status: 'active' | 'cancelled';
}

// ==================== عملاء الكريدي ====================
// كل العملاء في مجموعة واحدة «customers» مع حقل group للتمييز:
//  - 'credit'   : كريديات عادية
//  - 'deferred' : كريديات آجلة (تصنيف منفصل، نفس النظام)

export type CustomerGroup = 'credit' | 'deferred';

export interface Customer {
  id: string;
  name: string;
  nameLower: string;
  phone?: string;
  address?: string;
  creditLimit?: number;
  dueDate?: string | null;
  /** الدين الحالي: يزيد بالبيع كريدي، ينقص بالدفعة. */
  balance: number;
  group: CustomerGroup;
  createdAt: number;
  updatedAt: number;
}

// ==================== العمال ====================
// نوعان: 'hourly' أجر بالساعة (يُحسب من الدخول للخروج)، 'fixed' أجر محدّد.

export type WorkerType = 'hourly' | 'fixed';

export interface Worker {
  id: string;
  name: string;
  nameLower: string;
  type: WorkerType;
  /** أجر الساعة (للنوع hourly). */
  hourlyRate: number;
  /** الأجر المحدّد (للنوع fixed). */
  fixedWage: number;
  /** إجمالي السلفة المأخوذة. */
  advance: number;
  /** داخل حالياً (سجّل دخولاً ولم يخرج). */
  active: boolean;
  /** وقت آخر تسجيل دخول (ms) أو null. */
  clockInAt: number | null;
  /** معرّف الجلسة المفتوحة حالياً أو null. */
  currentSessionId: string | null;
  /** بريد حساب دخول العامل (إن أُنشئ له حساب بيع). */
  email?: string;
  /** uid حساب Firebase للعامل (إن وُجد). */
  authUid?: string;
  /** صلاحيات العامل (مسارات الصفحات المسموحة، '*' تعني كل شيء). */
  permissions?: string[];
  createdAt: number;
  updatedAt: number;
}

/** جلسة دخول/خروج ليوم عمل. */
export interface WorkSession {
  id: string;
  workerId: string;
  workerName: string;
  type: WorkerType;
  /** أجر الساعة وقت الجلسة (لقطة تاريخية). */
  rate: number;
  clockIn: number;
  clockOut: number | null;
  /** عدد الساعات (يُحسب عند الخروج). */
  hours: number;
  /** أجر الجلسة (للنوع hourly = hours × rate). */
  wage: number;
  createdAt: number;
}

// ==================== الموردون ====================
// المورّد: نشتري منه بضاعة؛ balance = ما نُدين له به (حسابات دائنة).

export interface Supplier {
  id: string;
  name: string;
  nameLower: string;
  phone?: string;
  address?: string;
  /** ما نُدين به للمورّد (يزيد بالشراء الآجل، ينقص بالدفع). */
  balance: number;
  /** ملاحظات عامة. */
  notes?: string;
  /** المنتجات/البضاعة التي يبيعها هذا المورّد. */
  products?: string;
  createdAt: number;
  updatedAt: number;
}
