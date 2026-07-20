'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import type { Lang } from '@/lib/i18n';
import { branding, formatMoney } from '@/lib/branding';
import { formatDateTime } from '@/lib/dates';
import { printHtml } from '@/lib/print';
import type { Product, Supplier } from '@/lib/types';
import { subscribeProducts, saveProduct } from '@/lib/products';
import { saveSupplier, appendSupplierProducts } from '@/lib/suppliers';
import { useSuppliers } from '@/lib/supplierStore';
import {
  recordPurchase,
  subscribePurchases,
  type PurchaseItemInput,
  type Purchase,
} from '@/lib/purchases';
import AddPurchaseProductDialog, { type AddPurchaseResult } from '@/components/purchases/AddPurchaseProductDialog';

interface Row extends PurchaseItemInput {}

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function PurchasesPage() {
  const { storeId } = useAuth();
  const { t, lang, dir } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const suppliers = useSuppliers(storeId);
  const [recent, setRecent] = useState<Purchase[]>([]);

  // حقول الفاتورة
  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [showSupplierDrop, setShowSupplierDrop] = useState(false);
  const supplierRef = useRef<HTMLDivElement>(null);

  const [invoiceNo, setInvoiceNo] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [addProdOpen, setAddProdOpen] = useState(false);

  // إضافة منتج (جديد أو موجود) من نافذة الإضافة.
  function handleAddPurchaseProduct(r: AddPurchaseResult) {
    if (!storeId) return;
    let pid = r.productId;
    if (r.newProduct) pid = saveProduct(storeId, r.newProduct); // إنشاء منتج جديد فوراً
    setRows((prev) => {
      const idx = prev.findIndex((x) => x.productId === pid);
      const row: Row = { productId: pid, name: r.name, isCarton: r.isCarton, unitsPerCarton: r.unitsPerCarton, qty: r.qty, cost: r.cost };
      if (idx >= 0) { const copy = [...prev]; copy[idx] = row; return copy; }
      return [...prev, row];
    });
    setAddProdOpen(false);
  }

  useEffect(() => {
    if (!storeId) return;
    const u1 = subscribeProducts(storeId, setProducts);
    const u2 = subscribePurchases(storeId, setRecent);
    return () => { u1(); u2(); };
  }, [storeId]);

  // إغلاق قائمة الموردين عند الضغط خارجها
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setShowSupplierDrop(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // تصفية الموردين بالبحث
  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 10);
    return suppliers.filter(
      (s) => s.nameLower.includes(q) || (s.phone ?? '').includes(q)
    ).slice(0, 10);
  }, [suppliers, supplierSearch]);

  function selectSupplier(s: Supplier) {
    setSelectedSupplier(s);
    setSupplierSearch(s.name);
    setShowSupplierDrop(false);
  }

  function clearSupplier() {
    setSelectedSupplier(null);
    setSupplierSearch('');
  }

  // اقتراحات المنتجات
  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.nameLower.includes(q) || p.barcodes.some((b) => b.includes(q))).slice(0, 8);
  }, [products, search]);

  function addRow(p: Product) {
    if (rows.some((r) => r.productId === p.id)) { setSearch(''); return; }
    const isCarton = p.type === 'carton';
    setRows([
      ...rows,
      {
        productId: p.id,
        name: p.name,
        isCarton,
        unitsPerCarton: p.unitsPerCarton || 1,
        qty: 1,
        cost: isCarton ? p.cartonPurchasePrice || 0 : p.unitPurchasePrice || 0,
      },
    ]);
    setSearch('');
  }

  function patchRow(i: number, fields: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...fields } : r)));
  }
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const total = useMemo(() => round2(rows.reduce((s, r) => s + r.qty * r.cost, 0)), [rows]);

  function save(print = false) {
    if (!storeId || rows.length === 0) { setMsg(t('purchases.msg.addOneItem')); return; }
    const supName = (selectedSupplier?.name ?? supplierSearch).trim();
    const actualPaid = paidAmount === '' ? total : Number(paidAmount);
    const method = actualPaid < total ? 'آجل' : 'نقدي';
    const itemNames = rows.map((r) => r.name);

    // ربط/إنشاء المورّد تلقائياً + إضافة أسماء البضاعة إليه.
    let supId = selectedSupplier?.id;
    if (!supId && supName) {
      supId = saveSupplier(storeId, { name: supName, products: itemNames.join('، ') });
    } else if (supId) {
      appendSupplierProducts(storeId, supId, selectedSupplier?.products ?? '', itemNames);
    }

    recordPurchase(
      storeId,
      { supplierId: supId, supplier: supName, invoiceNo: invoiceNo.trim(), paymentMethod: method, items: rows, total, paidAmount: actualPaid },
      products,
    );

    if (print) printPurchaseReceipt({ supplier: supName, invoiceNo: invoiceNo.trim(), items: rows, total, paid: actualPaid, createdAt: Date.now() }, lang, t);

    setRows([]);
    setSelectedSupplier(null);
    setSupplierSearch('');
    setInvoiceNo('');
    setPaidAmount('');
    setMsg(t('purchases.msg.saved'));
    setTimeout(() => setMsg(''), 3500);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>{t('purchases.receiveGoods')}</h2>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', marginBottom: 12 }}>

          {/* اختيار المورّد */}
          <div ref={supplierRef} style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                placeholder={t('purchases.pickSupplier')}
                value={supplierSearch}
                onChange={(e) => {
                  setSupplierSearch(e.target.value);
                  setSelectedSupplier(null);
                  setShowSupplierDrop(true);
                }}
                onFocus={() => setShowSupplierDrop(true)}
                style={{ paddingInlineEnd: selectedSupplier ? 32 : undefined }}
              />
              {selectedSupplier && (
                <button
                  onClick={clearSupplier}
                  title={t('purchases.clearSelection')}
                  style={{
                    position: 'absolute', insetInlineEnd: 8, top: '50%', transform: 'translateY(-50%)',
                    border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1,
                  }}
                >✕</button>
              )}
            </div>
            {showSupplierDrop && filteredSuppliers.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', insetInline: 0,
                background: '#ffffff', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 60,
                maxHeight: 220, overflowY: 'auto',
              }}>
                {filteredSuppliers.map((s) => (
                  <div
                    key={s.id}
                    onMouseDown={(e) => { e.preventDefault(); selectSupplier(s); }}
                    style={{
                      padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                      background: selectedSupplier?.id === s.id ? '#eff6ff' : '#ffffff',
                      fontSize: 14, fontWeight: 600, color: 'var(--text)'
                    }}
                  >
                    {s.name}
                  </div>
                ))}
              </div>
            )}
            {selectedSupplier && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, paddingInlineStart: 4 }}>
                {t('purchases.currentBalance')} <b style={{ color: selectedSupplier.balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {formatMoney(selectedSupplier.balance)}
                </b>
              </div>
            )}
          </div>

          <input className="input" placeholder={t('purchases.invoiceNo')} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} style={{ flex: 1 }} />
        </div>



        {/* بحث لإضافة صنف + إضافة منتج جديد */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input className="input" placeholder={t('purchases.searchProductToAdd')} value={search} onChange={(e) => setSearch(e.target.value)} />
          {suggestions.length > 0 && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', insetInline: 0, background: '#ffffff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 50, maxHeight: 250, overflowY: 'auto' }}>
              {suggestions.map((p) => (
                <div key={p.id} onMouseDown={(e) => { e.preventDefault(); addRow(p); }} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ fontSize: 14, color: 'var(--text)' }}>{p.name}</b>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.stock} {t('purchases.unit')} {p.type === 'carton' ? `· ${t('purchases.carton')}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
          <button type="button" className="btn" onClick={() => setAddProdOpen(true)} style={{ whiteSpace: 'nowrap' }}>{t('purchases.newProduct')}</button>
        </div>

        {/* أصناف الفاتورة */}
        {rows.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            {rows.map((r, i) => {
              const addedUnits = r.isCarton ? r.qty * r.unitsPerCarton : r.qty;
              return (
                <div key={r.productId} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <b>{r.name}</b>
                    <button onClick={() => removeRow(i)} style={{ border: 'none', background: 'none', color: 'var(--danger)', fontWeight: 800 }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
                    {r.unitsPerCarton > 1 && (
                      <select value={r.isCarton ? 'carton' : 'unit'} onChange={(e) => patchRow(i, { isCarton: e.target.value === 'carton' })} className="input" style={{ width: 'auto' }}>
                        <option value="carton">{t('purchases.cartons')}</option>
                        <option value="unit">{t('purchases.units')}</option>
                      </select>
                    )}
                    <label style={{ color: 'var(--text-muted)' }}>{r.isCarton ? t('purchases.cartonCount') : t('purchases.qty')}</label>
                    <input type="number" min={0} value={r.qty} onChange={(e) => patchRow(i, { qty: Number(e.target.value) })} style={inp} />
                    <label style={{ color: 'var(--text-muted)' }}>{r.isCarton ? t('purchases.cartonPrice') : t('purchases.unitPrice')}</label>
                    <input type="number" min={0} value={r.cost} onChange={(e) => patchRow(i, { cost: Number(e.target.value) })} style={inp} />
                    <span style={{ marginInlineStart: 'auto', color: 'var(--text-muted)' }}>{t('purchases.lineTotal', { n: addedUnits, total: formatMoney(round2(r.qty * r.cost)) })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* منطقة الدفع والحفظ الموحدة */}
        {rows.length > 0 && (
          <div style={{
            background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            padding: '16px', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {t('purchases.total')} <span style={{ color: 'var(--primary)' }}>{formatMoney(total)}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ fontSize: 14, fontWeight: 700 }}>{t('purchases.paidAmount')}</label>
                <input
                  type="number"
                  className="input"
                  placeholder={t('purchases.defaultAmount', { n: total })}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  style={{ width: 140, fontSize: 16, fontWeight: 'bold', background: '#fff' }}
                />
              </div>
            </div>

            {/* تفاصيل الدين إذا كان الدفع أقل من الإجمالي */}
            {paidAmount !== '' && Number(paidAmount) < total && (
              <div style={{ color: '#78350f', background: '#fef9c3', padding: '10px 14px', borderRadius: 8, fontSize: 13, border: '1px solid #fde047' }}>
                {t('purchases.debtWarning', { amount: formatMoney(total - Number(paidAmount)) })}
                {!selectedSupplier && <span style={{ color: 'var(--danger)', marginInlineStart: 4 }}>{t('purchases.pickSupplierFirst')}</span>}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {msg && <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: 14 }}>{msg}</span>}
              <button className="btn-outline" onClick={() => save(true)} style={{ padding: '10px 20px', fontSize: 15 }}>
                {t('purchases.saveAndPrint')}
              </button>
              <button className="btn" onClick={() => save(false)} style={{ padding: '10px 28px', fontSize: 16 }}>
                {t('purchases.saveReceive')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* آخر عمليات الاستلام */}
      <h3 style={{ fontSize: 15, margin: '4px 0 8px' }}>{t('purchases.recentTitle')}</h3>
      {recent.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>{t('purchases.noneYet')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {recent.map((p) => (
            <div key={p.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}>
              <div>
                <b>{p.supplier || t('purchases.unnamedSupplier')}</b>
                {p.invoiceNo && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> · {t('purchases.invoiceShort', { n: p.invoiceNo })}</span>}
                <span style={{ color: 'var(--text-muted)', fontSize: 12, marginInlineStart: 6 }}>· {p.paymentMethod === 'آجل' ? t('purchases.paymentCredit') : t('purchases.paymentCash')}</span>
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatDateTime(p.createdAt)} · {t('purchases.itemsCount', { n: p.items.length })}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <b style={{ color: p.paymentMethod === 'آجل' ? 'var(--danger)' : 'var(--text)' }}>{formatMoney(p.total)}</b>
                <button
                  onClick={() => printPurchaseReceipt({ supplier: p.supplier, invoiceNo: p.invoiceNo, items: p.items, total: p.total, paid: p.paidAmount ?? p.total, createdAt: p.createdAt }, lang, t)}
                  title={t('purchases.printReceiptTitle')}
                  style={{ border: '1px solid var(--border)', background: '#fff', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}
                >🖨️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* إضافة منتج جديد/موجود للفاتورة */}
      <AddPurchaseProductDialog
        open={addProdOpen}
        products={products}
        onSubmit={handleAddPurchaseProduct}
        onClose={() => setAddProdOpen(false)}
      />
    </div>
  );
}

const inp: React.CSSProperties = { width: 90, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px' };

function escP(s: string): string {
  return (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/** طباعة وصل استلام بضاعة (72mm). */
function printPurchaseReceipt(
  d: {
    supplier: string;
    invoiceNo: string;
    items: { name: string; qty: number; cost: number }[];
    total: number;
    paid: number;
    createdAt: number;
  },
  lang: Lang,
  t: (key: string, vars?: Record<string, string | number>) => string,
): void {
  const rows = d.items
    .map((it) => `<tr><td class="n">${escP(it.name)}</td><td class="c">${it.qty}</td><td class="c">${it.cost.toFixed(2)}</td><td class="t">${(it.qty * it.cost).toFixed(2)}</td></tr>`)
    .join('');
  const remaining = Math.max(0, d.total - d.paid);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const align = dir === 'rtl' ? 'right' : 'left';
  printHtml(`<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}body{width:72mm;margin:0 auto;font-family:'Segoe UI',Tahoma,sans-serif;color:#000;font-weight:800}
    .c1{text-align:center}.st{font-size:18px}.m{font-size:12px;font-weight:600}hr{border:none;border-top:1.5px dashed #000;margin:6px 0}
    table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:12px}th,td{padding:2px 0;text-align:${align};overflow:hidden}
    .n{width:46%}.c{width:15%;text-align:center}.t{width:24%;text-align:left}
    .g{display:flex;justify-content:space-between;font-size:15px;margin-top:3px}</style></head><body>
    <div class="c1 st">${escP(branding.storeName)}</div>
    <div class="c1 m">${t('purchases.receipt.title')}</div>
    <div class="c1 m">${new Date(d.createdAt).toLocaleString(lang === 'ar' ? 'ar-DZ' : 'fr-FR')}</div>
    <hr/>
    <div class="m">${t('purchases.receipt.supplier', { name: escP(d.supplier || '—') })}${d.invoiceNo ? ` · ${t('purchases.invoiceShort', { n: escP(d.invoiceNo) })}` : ''}</div>
    <hr/>
    <table><thead><tr><th class="n">${t('purchases.receipt.name')}</th><th class="c">${t('purchases.receipt.qty')}</th><th class="c">${t('purchases.receipt.price')}</th><th class="t">${t('purchases.receipt.total')}</th></tr></thead><tbody>${rows}</tbody></table>
    <hr/>
    <div class="g"><span>${t('purchases.receipt.grandTotal')}</span><span>${d.total.toFixed(2)}</span></div>
    <div class="g"><span>${t('purchases.receipt.paid')}</span><span>${d.paid.toFixed(2)}</span></div>
    ${remaining > 0 ? `<div class="g"><span>${t('purchases.receipt.remainingDebt')}</span><span>${remaining.toFixed(2)}</span></div>` : ''}
    <hr/><div class="c1 m">${t('purchases.receipt.thanks')}</div></body></html>`);
}
