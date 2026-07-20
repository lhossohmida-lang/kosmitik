/**
 * مساعد ذكي عبر OpenRouter — نموذج cohere/command-r-plus:free.
 * الاستدعاء من الواجهة مباشرة (NEXT_PUBLIC_*) ليعمل في EXE/APK/Web.
 * السياق الذكي: يُرسل ملخّصات شاملة + تفاصيل مطابقة للسؤال.
 */
import type { Product, Sale, Customer, Supplier, Worker, WorkSession } from './types';
import type { Purchase } from './purchases';
import type { Expense } from './expenses';
import { branding } from './branding';

export interface AiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ====== إعداد OpenRouter ======
const OPENROUTER_API_KEY =
  process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || '';

const OPENROUTER_MODEL =
  process.env.NEXT_PUBLIC_OPENROUTER_MODEL || 'deepseek/deepseek-chat:free';

export const aiConfigured = Boolean(OPENROUTER_API_KEY);

// ====== بناء سياق المساعد الذكي ======
export function buildContext(
  question: string,
  products: Product[],
  sales: Sale[],
  customers: Customer[],
  suppliers: Supplier[],
  purchases: Purchase[],
  workers: Worker[],
  expenses: Expense[],
  workSessions: WorkSession[],
  lang: 'ar' | 'fr' = 'ar',
): string {
  const now = Date.now();

  // ─── إحصائيات المبيعات ───
  const activeSales = sales.filter((s) => s.status === 'active');
  const cancelledSales = sales.filter((s) => s.status === 'cancelled');
  const monthSalesTotal = activeSales.reduce((a, s) => a + s.total, 0);
  const cashSales = activeSales.filter((s) => s.payment === 'cash');
  const creditSales = activeSales.filter((s) => s.payment === 'credit');
  const totalDiscount = activeSales.reduce((a, s) => a + (s.discount || 0), 0);
  const totalSubtotal = activeSales.reduce((a, s) => a + s.subtotal, 0);
  const grossProfit = activeSales.reduce((a, s) => {
    const cost = s.items.reduce((c, i) => c + i.unitPurchasePrice * i.qty, 0);
    return a + (s.total - cost);
  }, 0);

  // ─── إحصائيات المشتريات ───
  const monthPurchasesTotal = purchases.reduce((a, p) => a + p.total, 0);

  // ─── إحصائيات المخزون ───
  const outOfStock = products.filter((p) => p.stock <= 0).length;
  const lowStock = products.filter((p) => p.minStock > 0 && p.stock > 0 && p.stock <= p.minStock).length;
  const nearExpiry = products.filter((p) => {
    if (!p.expiry) return false;
    const t = new Date(p.expiry).getTime();
    return !isNaN(t) && t <= now + 30 * 24 * 3600 * 1000;
  }).length;

  // ─── إحصائيات العملاء والموردين ───
  const customerDebts = customers.reduce((a, c) => a + Math.max(0, c.balance), 0);
  const supplierDebts = suppliers.reduce((a, s) => a + Math.max(0, s.balance), 0);

  // ─── إحصائيات العمال ───
  const activeWorkers = workers.filter((w) => w.active).length;
  const totalAdvances = workers.reduce((a, w) => a + (w.advance || 0), 0);
  const totalWorkerWages = workSessions.reduce((a, ws) => a + (ws.wage || 0), 0);

  // ─── إحصائيات المصاريف ───
  const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0);

  // ─── فحص كلمات السؤال ───
  const q = question.toLowerCase();
  const qWords = q.split(/\s+/).filter((w) => w.length > 2);

  const matchesQ = (text: string) =>
    text && (q.includes(text.toLowerCase()) || qWords.some((w) => text.toLowerCase().includes(w)));

  // ─── بحث المنتجات المذكورة ───
  const mentionedProducts = products
    .filter(
      (p) =>
        matchesQ(p.name) ||
        (p.barcodes && p.barcodes.some((b) => q.includes(b))) ||
        matchesQ(p.category),
    )
    .slice(0, 30);

  // ─── بحث العملاء المذكورين ───
  const mentionedCustomers = customers
    .filter((c) => matchesQ(c.name) || (c.phone && q.includes(c.phone)))
    .slice(0, 15);

  // ─── بحث الموردين المذكورين ───
  const mentionedSuppliers = suppliers
    .filter((s) => matchesQ(s.name) || (s.phone && q.includes(s.phone)))
    .slice(0, 15);

  // ─── بحث العمال المذكورين ───
  const mentionedWorkers = workers.filter((w) => matchesQ(w.name)).slice(0, 10);

  // ─── هل السؤال تقريري؟ ───
  const isReport =
    q.includes('مبيع') || q.includes('فاتور') || q.includes('بيع') ||
    q.includes('sales') || q.includes('شراء') || q.includes('مشتريات') ||
    q.includes('تقرير') || q.includes('إجمالي') || q.includes('report') ||
    q.includes('ربح') || q.includes('خسار') || q.includes('مصروف') ||
    q.includes('عامل') || q.includes('ساعة') || q.includes('راتب') ||
    q.includes('دين') || q.includes('عميل');

  // ─── تفاصيل المنتجات ───
  const productsDetails = mentionedProducts.map((p) =>
    `- ${p.name} | الفئة: ${p.category || 'عام'} | الباركود: ${p.barcodes?.join('، ') || 'لا يوجد'} | المخزون: ${p.stock} وحدة | الحد الأدنى: ${p.minStock} | سعر الشراء: ${p.unitPurchasePrice} | سعر البيع: ${p.unitSellPrice} | الوحدة: ${p.unit}${p.expiry ? ` | الصلاحية: ${p.expiry}` : ''}${p.type === 'carton' ? ` | نوع: كرتونة (${p.unitsPerCarton} وحدة/كرتونة)` : ' | نوع: وحدة'}`,
  );

  // ─── تفاصيل العملاء ───
  const customersDetails = mentionedCustomers.map((c) =>
    `- ${c.name} | الديون: ${c.balance} | الهاتف: ${c.phone || 'غير متوفر'} | العنوان: ${c.address || 'غير متوفر'} | النوع: ${c.group === 'credit' ? 'كريدي عادي' : 'كريدي آجل'} | حد الائتمان: ${c.creditLimit || 'غير محدد'}`,
  );

  // ─── تفاصيل الموردين ───
  const suppliersDetails = mentionedSuppliers.map((s) =>
    `- ${s.name} | الديون علينا: ${s.balance} | الهاتف: ${s.phone || 'غير متوفر'} | المنتجات: ${s.products || 'غير محدد'} | ملاحظات: ${s.notes || 'لا يوجد'}`,
  );

  // ─── تفاصيل العمال ───
  const workersDetails = mentionedWorkers.map((w) =>
    `- ${w.name} | النوع: ${w.type === 'hourly' ? 'بالساعة' : 'راتب ثابت'} | أجر الساعة: ${w.hourlyRate} | الراتب الثابت: ${w.fixedWage} | السلفة: ${w.advance} | الحالة: ${w.active ? 'داخل الآن' : 'خارج'}`,
  );

  // ─── الفواتير ذات الصلة ───
  let recentSalesDetails: string[] = [];
  if (isReport || mentionedProducts.length > 0 || mentionedCustomers.length > 0) {
    const relevantSales = activeSales
      .filter(
        (s) =>
          isReport ||
          (s.customerId && mentionedCustomers.some((c) => c.id === s.customerId)) ||
          s.items.some((i) => mentionedProducts.some((p) => p.id === i.productId)),
      )
      .slice(0, 50);

    recentSalesDetails = relevantSales.map((s) => {
      const items = s.items
        .map((i) => `${i.name}×${i.qty} (سعر: ${i.unitSellPrice}، تكلفة: ${i.unitPurchasePrice})`)
        .join(' | ');
      const profit = s.items.reduce((a, i) => a + (i.unitSellPrice - i.unitPurchasePrice) * i.qty, 0) - (s.discount || 0);
      return `• [${new Date(s.createdAt).toLocaleDateString('ar-DZ')}] المبلغ: ${s.total} | الخصم: ${s.discount || 0} | الدفع: ${s.payment === 'cash' ? 'نقداً' : 'كريدي'} | العميل: ${s.customerName || 'نقدي'} | الربح: ${profit.toFixed(2)} | الأصناف: [${items}]`;
    });
  }

  // ─── فواتير المشتريات ذات الصلة ───
  let recentPurchasesDetails: string[] = [];
  if (isReport || mentionedProducts.length > 0 || mentionedSuppliers.length > 0) {
    const relevantPurchases = purchases
      .filter(
        (p) =>
          isReport ||
          (p.supplierId && mentionedSuppliers.some((s) => s.id === p.supplierId)) ||
          p.items.some((i) => mentionedProducts.some((mp) => mp.id === i.productId)),
      )
      .slice(0, 30);

    recentPurchasesDetails = relevantPurchases.map((p) => {
      const items = p.items
        .map((i) => `${i.name}×${i.qty} (${i.isCarton ? 'كرتونة' : 'وحدة'} @ ${i.cost})`)
        .join(' | ');
      return `• [${new Date(p.createdAt).toLocaleDateString('ar-DZ')}] المبلغ: ${p.total} | المورد: ${p.supplier || 'غير محدد'} | فاتورة رقم: ${p.invoiceNo || 'لا يوجد'} | طريقة الدفع: ${p.paymentMethod || 'غير محدد'} | الأصناف: [${items}]`;
    });
  }

  // ─── جلسات العمل ───
  let workSessionsDetails: string[] = [];
  if (isReport || mentionedWorkers.length > 0) {
    const relevantSessions = workSessions
      .filter((ws) => mentionedWorkers.length === 0 || mentionedWorkers.some((w) => w.id === ws.workerId))
      .slice(0, 30);
    workSessionsDetails = relevantSessions.map((ws) =>
      `• ${ws.workerName} | دخول: ${new Date(ws.clockIn).toLocaleString('ar-DZ')} | خروج: ${ws.clockOut ? new Date(ws.clockOut).toLocaleString('ar-DZ') : 'لم يخرج'} | ساعات: ${ws.hours} | أجر الجلسة: ${ws.wage}`,
    );
  }

  // ─── تفاصيل المصاريف ───
  let expensesDetails: string[] = [];
  if (isReport || q.includes('مصروف') || q.includes('نفقة') || q.includes('expense')) {
    expensesDetails = expenses.slice(0, 30).map((e) =>
      `• [${new Date(e.createdAt).toLocaleDateString('ar-DZ')}] ${e.description}: ${e.amount}${e.note ? ` (${e.note})` : ''}`,
    );
  }

  // ─── مقدّمة المساعد ───
  const intro =
    lang === 'fr'
      ? `Tu es un assistant expert pour le système de caisse et de gestion des stocks « ${branding.storeName} ». Devise : ${branding.currency.symbol}. Tu as un accès complet à la base de données (produits, ventes, achats, clients crédit, fournisseurs, employés, dépenses, sessions de travail). Réponds de manière précise, professionnelle et complète, en te basant UNIQUEMENT sur les données fournies ci-dessous.`
      : `أنت مساعد خبير لنظام الكاشير والمخزون «${branding.storeName}». العملة: ${branding.currency.symbol}. لديك وصول كامل لقاعدة البيانات الشاملة (المنتجات، المبيعات، المشتريات، عملاء الكريدي، الموردين، العمال، المصاريف، جلسات الدوام). أجب بدقة واحترافية واستنادًا فقط إلى البيانات المرفقة أدناه. إن لم تجد إجابة في البيانات، قل ذلك بوضوح.`;

  return [
    intro,

    `\n=== 📊 ملخص عام للنظام (آخر 30 يوماً) ===`,

    `\n🛒 المبيعات:`,
    `  • إجمالي المبيعات: ${monthSalesTotal.toFixed(2)} ${branding.currency.symbol} (${activeSales.length} فاتورة نشطة، ${cancelledSales.length} ملغاة)`,
    `  • مبيعات نقدية: ${cashSales.length} فاتورة | مبيعات كريدي: ${creditSales.length} فاتورة`,
    `  • إجمالي الخصومات: ${totalDiscount.toFixed(2)} | المجموع قبل الخصم: ${totalSubtotal.toFixed(2)}`,
    `  • الربح الإجمالي التقريبي (بعد التكلفة والخصم): ${grossProfit.toFixed(2)}`,

    `\n📦 المشتريات:`,
    `  • إجمالي المشتريات: ${monthPurchasesTotal.toFixed(2)} (${purchases.length} فاتورة)`,

    `\n🏪 المخزون:`,
    `  • ${products.length} منتج مسجّل | نافد: ${outOfStock} | منخفض: ${lowStock} | قرب الانتهاء: ${nearExpiry}`,

    `\n👥 العملاء والموردون:`,
    `  • إجمالي ديون العملاء لنا: ${customerDebts.toFixed(2)}`,
    `  • إجمالي ديوننا للموردين: ${supplierDebts.toFixed(2)}`,
    `  • عدد العملاء: ${customers.length} | عدد الموردين: ${suppliers.length}`,

    `\n👷 العمال:`,
    `  • إجمالي العمال: ${workers.length} | داخلون الآن: ${activeWorkers}`,
    `  • إجمالي السلف: ${totalAdvances.toFixed(2)} | إجمالي الأجور المحسوبة: ${totalWorkerWages.toFixed(2)}`,

    `\n💸 المصاريف:`,
    `  • إجمالي المصاريف: ${totalExpenses.toFixed(2)} (${expenses.length} مصروف)`,

    mentionedProducts.length
      ? `\n=== 🔍 بيانات المنتجات المطابقة ===\n${productsDetails.join('\n')}`
      : '',
    mentionedCustomers.length
      ? `\n=== 👤 بيانات العملاء المطابقين ===\n${customersDetails.join('\n')}`
      : '',
    mentionedSuppliers.length
      ? `\n=== 🚚 بيانات الموردين المطابقين ===\n${suppliersDetails.join('\n')}`
      : '',
    mentionedWorkers.length
      ? `\n=== 👷 بيانات العمال المطابقين ===\n${workersDetails.join('\n')}`
      : '',
    recentSalesDetails.length
      ? `\n=== 🧾 فواتير المبيعات ذات الصلة (عينة) ===\n${recentSalesDetails.join('\n')}`
      : '',
    recentPurchasesDetails.length
      ? `\n=== 📋 فواتير المشتريات ذات الصلة ===\n${recentPurchasesDetails.join('\n')}`
      : '',
    workSessionsDetails.length
      ? `\n=== ⏰ جلسات الدوام ذات الصلة ===\n${workSessionsDetails.join('\n')}`
      : '',
    expensesDetails.length
      ? `\n=== 💸 تفاصيل المصاريف ===\n${expensesDetails.join('\n')}`
      : '',

    `\n\n[تعليمات للذكاء الاصطناعي] استخدم البيانات الواردة أعلاه للإجابة على سؤال المستخدم بدقة وثقة. قدّم الأرقام محسوبة بشكل صحيح. إن طُلب منك مقارنة أو تحليل، افعل ذلك بناءً على البيانات الفعلية.`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * يرسل المحادثة إلى OpenRouter ويُعيد نص الرد.
 * يرمي 'QUOTA' عند تجاوز الحد، 'NO_KEY' إن لم يُضبط المفتاح.
 */
export async function askAi(messages: AiMessage[]): Promise<string> {
  if (!OPENROUTER_API_KEY) throw new Error('NO_KEY');

  // OpenRouter يقبل نفس تنسيق OpenAI (messages بأدوار user/assistant/system)
  const body = {
    model: OPENROUTER_MODEL,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: 0.3,
    max_tokens: 2048,
  };

  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://kosmitik.app',
        'X-Title': branding.storeName,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('NETWORK');
  }

  if (res.ok) {
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? 'لا يوجد رد.';
  }

  const errText = await res.text();
  console.error(`OpenRouter (${OPENROUTER_MODEL}) خطأ ${res.status}:`, errText.slice(0, 300));

  if (res.status === 429 || res.status === 402) throw new Error('QUOTA');
  throw new Error(`HTTP_${res.status}`);
}
