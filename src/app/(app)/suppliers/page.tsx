'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { branding, formatMoney } from '@/lib/branding';
import { formatDateTime } from '@/lib/dates';
import { printHtml } from '@/lib/print';
import type { Supplier } from '@/lib/types';
import {
  saveSupplier,
  deleteSupplier,
  recordSupplierPayment,
  recordSupplierDebt,
  subscribeSupplierTxns,
  type SupplierInput,
  type SupplierTxn,
} from '@/lib/suppliers';
import { useSuppliers } from '@/lib/supplierStore';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import PeopleImportDialog from '@/components/PeopleImportDialog';

export default function SuppliersPage() {
  const { storeId } = useAuth();
  const { t } = useLanguage();
  const suppliers = useSuppliers(storeId);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [payFor, setPayFor] = useState<Supplier | null>(null);
  const [toDelete, setToDelete] = useState<Supplier | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [viewProducts, setViewProducts] = useState<Supplier | null>(null);

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return suppliers.filter((x) => !s || x.nameLower.includes(s) || (x.phone ?? '').includes(s));
  }, [suppliers, search]);

  const totalOwed = useMemo(() => list.reduce((a, s) => a + Math.max(0, s.balance), 0), [list]);
  const existingNames = useMemo(() => new Set(suppliers.map((s) => s.nameLower)), [suppliers]);

  function handleSave(input: SupplierInput, id?: string) {
    if (!storeId) return;
    saveSupplier(storeId, input, id);
    setFormOpen(false);
    setEditing(null);
  }

  // تحويل نص المنتجات إلى قائمة أسماء
  function parseProducts(products: string): string[] {
    if (!products) return [];
    // فصل بأي نوع من الفواصل: ، , ; ؛ | \n
    const parts = products.split(/[،,;؛|\n]+/);
    return parts.map((p) => p.trim()).filter(Boolean);
  }

  return (
    <div>
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 22 }}>{t('suppliers.title')}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('suppliers.subtitle')}</p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 180 }}
          placeholder={t('suppliers.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="card" style={{ padding: '8px 14px' }}>
          {t('suppliers.totalOwed')} <b style={{ color: 'var(--danger)' }}>{formatMoney(totalOwed)}</b>
        </div>
        <button className="btn" onClick={() => setBulkOpen(true)} title={t('suppliers.selectGroupTitle')}>
          {t('suppliers.selectGroup')}
        </button>
        <button className="btn" onClick={() => setImportOpen(true)} title={t('suppliers.importTitle')}>
          {t('suppliers.import')}
        </button>
        <button className="btn" onClick={() => { setEditing(null); setFormOpen(true); }}>
          {t('suppliers.newSupplier')}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>{t('suppliers.noneYet')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(270px,1fr))' }}>
          {list.map((s) => (
            <div
              key={s.id}
              className="card"
              onClick={() => setViewProducts(s)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                cursor: 'pointer',
                transition: 'box-shadow 0.15s, transform 0.12s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)';
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = '';
                (e.currentTarget as HTMLDivElement).style.transform = '';
              }}
            >
              {/* الاسم + الرصيد فقط */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <b style={{ fontSize: 16 }}>{s.name}</b>
                  {s.phone && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }} dir="ltr">
                      📞 {s.phone}
                    </div>
                  )}
                </div>
                <span style={{
                  color: s.balance > 0 ? 'var(--danger)' : 'var(--success)',
                  fontWeight: 800, fontSize: 15,
                }}>
                  {formatMoney(s.balance)}
                </span>
              </div>

              {/* مؤشر وجود منتجات */}
              {s.products && (
                <div style={{ fontSize: 12, color: '#166534', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>📦</span>
                  <span style={{ opacity: 0.75 }}>{t('suppliers.clickToViewProducts')}</span>
                </div>
              )}

              {/* الأزرار — توقف انتشار الحدث لمنع فتح اللافتة */}
              <div
                style={{ display: 'flex', gap: 6, marginTop: 4 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="btn-outline"
                  onClick={() => setPayFor(s)}
                  style={{ flex: 1, padding: '6px', fontSize: 13, background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}
                >{t('suppliers.payDebt')}</button>
                <button
                  className="btn-outline"
                  onClick={() => { setEditing(s); setFormOpen(true); }}
                  style={{ flex: 1, padding: '6px', fontSize: 13, background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}
                >{t('suppliers.edit')}</button>
                <button
                  onClick={() => setToDelete(s)}
                  style={{ padding: '6px 10px', fontSize: 13, fontWeight: 700, border: '1.5px solid #fecaca', background: '#fef2f2', color: 'var(--danger)', borderRadius: 'var(--radius)' }}
                >{t('suppliers.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* لافتة منتجات المورد */}
      {viewProducts && (
        <Modal open onClose={() => setViewProducts(null)} title={t('suppliers.productsModalTitle', { name: viewProducts.name })} width={500}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* معلومات مختصرة */}
            <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap', alignItems: 'center' }}>
              {viewProducts.phone && (
                <span style={{ color: 'var(--text-muted)' }}>📞 {viewProducts.phone}</span>
              )}
              <span style={{
                fontWeight: 700,
                color: viewProducts.balance > 0 ? 'var(--danger)' : 'var(--success)',
                background: viewProducts.balance > 0 ? '#fef2f2' : '#f0fdf4',
                padding: '3px 10px', borderRadius: 999, fontSize: 13,
              }}>
                {t('suppliers.weOwe')} {formatMoney(viewProducts.balance)}
              </span>
            </div>

            {/* قائمة المنتجات */}
            {viewProducts.products ? (
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>
                  {t('suppliers.suppliedProducts')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {parseProducts(viewProducts.products).map((p, i) => (
                    <span key={i} style={{
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: 20,
                      padding: '6px 16px',
                      fontSize: 14,
                      color: '#166534',
                      fontWeight: 600,
                      lineHeight: 1.4,
                    }}>
                      {p}
                    </span>
                  ))}
                </div>
                {/* عرض النص الكامل إن كان طويلاً */}
                {viewProducts.products.length > 60 && (
                  <div style={{
                    marginTop: 10, fontSize: 12, color: 'var(--text-muted)',
                    background: '#f8fafc', borderRadius: 6, padding: '6px 10px',
                    lineHeight: 1.8,
                  }}>
                    {t('suppliers.fullText', { text: viewProducts.products })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                color: 'var(--text-muted)', fontSize: 13,
                background: '#f8fafc', borderRadius: 8, padding: '12px 16px', textAlign: 'center',
              }}>
                {t('suppliers.noProductsRegistered')}
              </div>
            )}

            {/* ملاحظات */}
            {viewProducts.notes && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                🧾 {viewProducts.notes}
              </div>
            )}

            {/* سجل المعاملات مع المورّد */}
            {storeId && <SupplierTxnsList storeId={storeId} supplier={viewProducts} />}

            <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => { setPayFor(viewProducts); }} style={{ background: 'var(--success)' }}>
                {t('suppliers.payDebtBtn')}
              </button>
              <button className="btn" onClick={() => { setEditing(viewProducts); setViewProducts(null); setFormOpen(true); }}>
                {t('suppliers.editSupplier')}
              </button>
              <button className="btn-outline" onClick={() => setViewProducts(null)} style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* لافتة التحديد الجماعي والحذف */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title={t('suppliers.bulkModalTitle')} width={560}>
        <BulkDeleteSuppliers
          suppliers={list}
          onDelete={(ids) => {
            if (storeId) ids.forEach((id) => deleteSupplier(storeId, id));
            setBulkOpen(false);
          }}
          onClose={() => setBulkOpen(false)}
        />
      </Modal>

      <Modal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} title={editing ? t('suppliers.editSupplierTitle') : t('suppliers.newSupplierTitle')} width={460}>
        <SupplierForm editing={editing} onSubmit={handleSave} onClose={() => { setFormOpen(false); setEditing(null); }} />
      </Modal>

      {payFor && storeId && (
        <PayDialog
          supplier={payFor}
          onClose={() => setPayFor(null)}
          onSubmit={(delta) => {
            if (delta < 0) recordSupplierPayment(storeId, payFor.id, -delta, t('suppliers.txn.payment'));
            else recordSupplierDebt(storeId, payFor.id, delta, t('suppliers.txn.manualDebt'));
            setPayFor(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title={t('suppliers.deleteSupplierTitle')}
        message={t('suppliers.deleteSupplierConfirm', { name: toDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => { if (storeId && toDelete) deleteSupplier(storeId, toDelete.id); setToDelete(null); }}
        onCancel={() => setToDelete(null)}
      />

      {storeId && (
        <PeopleImportDialog
          open={importOpen}
          storeId={storeId}
          kind="supplier"
          existingNames={existingNames}
          onClose={() => setImportOpen(false)}
          onDone={() => {}}
        />
      )}
    </div>
  );
}

// ─── لافتة التحديد الجماعي والحذف ───────────────────────────────────────────
function BulkDeleteSuppliers({
  suppliers,
  onDelete,
  onClose,
}: {
  suppliers: Supplier[];
  onDelete: (ids: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [rows, setRows] = useState(
    suppliers.map((s) => ({ id: s.id, name: s.name, phone: s.phone ?? '', balance: s.balance, sel: false }))
  );
  const [confirmDel, setConfirmDel] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.phone.includes(q)) : rows;
  }, [rows, search]);

  const selectedIds = rows.filter((r) => r.sel).map((r) => r.id);
  const allSelected = filtered.length > 0 && filtered.every((r) => r.sel);

  function toggleAll() {
    const filteredIds = new Set(filtered.map((r) => r.id));
    setRows((prev) =>
      prev.map((r) => filteredIds.has(r.id) ? { ...r, sel: !allSelected } : r)
    );
  }

  function toggleOne(id: string) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, sel: !r.sel } : r));
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
        {t('suppliers.bulkHint')}
      </div>

      {/* بحث داخل اللافتة */}
      <input
        className="input"
        placeholder={t('suppliers.searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      {/* رأس: تحديد الكل */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderBottom: '1px solid var(--border)', marginBottom: 6,
        background: '#f8fafc', borderRadius: '8px 8px 0 0',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = selectedIds.length > 0 && !allSelected; }}
            onChange={toggleAll}
          />
          {t('suppliers.selectAllCount', { sel: selectedIds.length, total: rows.length })}
        </label>
      </div>

      {/* القائمة */}
      <div style={{ display: 'grid', gap: 4, maxHeight: 340, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: 13 }}>{t('suppliers.noResults')}</div>
        ) : (
          filtered.map((r) => (
            <div
              key={r.id}
              onClick={() => toggleOne(r.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: r.sel ? '#fff1f2' : '#fff',
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
            >
              <input
                type="checkbox"
                checked={r.sel}
                onChange={() => toggleOne(r.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{r.name}</span>
              {r.phone && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }} dir="ltr">{r.phone}</span>
              )}
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: r.balance > 0 ? 'var(--danger)' : 'var(--success)',
                minWidth: 70, textAlign: 'left',
              }}>
                {formatMoney(r.balance)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* أزرار الإجراءات */}
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button
          onClick={() => setConfirmDel(true)}
          disabled={selectedIds.length === 0}
          style={{
            padding: '10px 16px', borderRadius: 'var(--radius)', border: 'none',
            fontWeight: 700,
            background: selectedIds.length ? 'var(--danger)' : '#e2e8f0',
            color: '#fff',
            cursor: selectedIds.length ? 'pointer' : 'not-allowed',
            fontSize: 14,
          }}
        >
          {t('suppliers.deleteSelectedCount', { n: selectedIds.length })}
        </button>
        <button
          className="btn-outline"
          onClick={onClose}
          style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}
        >
          {t('common.close')}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDel}
        title={t('suppliers.deleteManyTitle')}
        message={t('suppliers.deleteManyConfirm', { n: selectedIds.length })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => { onDelete(selectedIds); setConfirmDel(false); }}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  );
}

// ─── نموذج إضافة/تعديل مورد ──────────────────────────────────────────────────
function SupplierForm({ editing, onSubmit, onClose }: { editing?: Supplier | null; onSubmit: (i: SupplierInput, id?: string) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState(editing?.name ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [products, setProducts] = useState(editing?.products ?? '');
  const [opening, setOpening] = useState('');
  const [error, setError] = useState('');
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t('suppliers.form.nameRequired'));
    onSubmit(
      { name: name.trim(), phone: phone.trim(), address: address.trim(), notes: notes.trim(), products: products.trim(), ...(editing ? {} : { balance: Number(opening) || 0 }) },
      editing?.id,
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <div><label style={label}>{t('suppliers.form.name')}</label><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div><label style={label}>{t('suppliers.form.phone')}</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" style={{ textAlign: 'right' }} /></div>
        {!editing && <div><label style={label}>{t('suppliers.form.opening')}</label><input className="input" type="number" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" /></div>}
      </div>
      <div>
        <label style={label}>{t('suppliers.form.products')}</label>
        <input className="input" value={products} onChange={(e) => setProducts(e.target.value)} placeholder={t('suppliers.form.productsPlaceholder')} />
      </div>
      <div><label style={label}>{t('suppliers.form.address')}</label><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
      <div><label style={label}>{t('suppliers.form.notes')}</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" type="submit">{editing ? t('common.save') : t('common.add')}</button>
        <button type="button" className="btn-outline" onClick={onClose} style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}>{t('common.cancel')}</button>
      </div>
    </form>
  );
}

// ─── نافذة الدفع والدين ───────────────────────────────────────────────────────
function PayDialog({ supplier, onSubmit, onClose }: { supplier: Supplier; onSubmit: (delta: number) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  function go(sign: 1 | -1) {
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return setError(t('suppliers.pay.amountRequired'));
    onSubmit(sign * a);
  }
  return (
    <Modal open onClose={onClose} title={t('suppliers.pay.title', { name: supplier.name })} width={360}>
      <div style={{ marginBottom: 6, fontSize: 14 }}>{t('suppliers.pay.current')} <b style={{ color: 'var(--danger)' }}>{formatMoney(supplier.balance)}</b></div>
      {supplier.products && (
        <div style={{ fontSize: 12, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '4px 8px', marginBottom: 10 }}>
          📦 {supplier.products}
        </div>
      )}
      <input className="input" type="number" autoFocus placeholder={t('suppliers.pay.amountPlaceholder')} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ marginBottom: 10 }} />
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" onClick={() => go(-1)} style={{ background: 'var(--success)' }}>{t('suppliers.pay.settle')}</button>
        <button className="btn" onClick={() => go(1)} style={{ background: 'var(--danger)' }}>{t('suppliers.pay.newDebt')}</button>
      </div>
    </Modal>
  );
}

// ─── سجل معاملات المورّد + طباعة ────────────────────────────────────────────
function SupplierTxnsList({ storeId, supplier }: { storeId: string; supplier: Supplier }) {
  const { t, lang } = useLanguage();
  const TXN_LABEL: Record<SupplierTxn['type'], string> = {
    purchase: t('suppliers.txn.purchase'),
    payment: t('suppliers.txn.paymentLabel'),
    debt: t('suppliers.txn.debt'),
  };
  const [txns, setTxns] = useState<SupplierTxn[]>([]);
  useEffect(() => subscribeSupplierTxns(storeId, supplier.id, setTxns), [storeId, supplier.id]);

  function printAll() {
    const dir: 'rtl' | 'ltr' = lang === 'ar' ? 'rtl' : 'ltr';
    const align = dir === 'rtl' ? 'right' : 'left';
    const rows = txns
      .map((tx) => {
        const paidPart = tx.type === 'purchase' && tx.paid != null ? t('suppliers.txn.paidPart', { n: tx.paid.toFixed(2) }) : '';
        return `<tr><td>${formatDateTime(tx.createdAt)}</td><td>${TXN_LABEL[tx.type]}${tx.note ? ' — ' + escS(tx.note) : ''}</td><td style="text-align:left">${tx.amount.toFixed(2)}${paidPart}</td></tr>`;
      })
      .join('');
    printHtml(`<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><style>
      body{font-family:'Segoe UI',Tahoma,sans-serif;padding:16px;color:#000}h2,h3{margin:0 0 4px}
      table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}td,th{border-bottom:1px solid #ccc;padding:6px;text-align:${align}}</style></head><body>
      <h2>${escS(branding.storeName)}</h2><h3>${t('suppliers.txn.statementTitle', { name: escS(supplier.name) })}</h3>
      <div>${t('suppliers.pay.current')} <b>${formatMoney(supplier.balance)}</b></div>
      <table><thead><tr><th>${t('suppliers.txn.date')}</th><th>${t('suppliers.txn.transaction')}</th><th>${t('suppliers.txn.amount')}</th></tr></thead><tbody>${rows}</tbody></table>
      </body></html>`);
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <b style={{ fontSize: 14 }}>{t('suppliers.txn.log', { n: txns.length })}</b>
        <button onClick={printAll} disabled={txns.length === 0} className="btn-outline" style={{ padding: '4px 10px', fontSize: 12, background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}>{t('suppliers.txn.printStatement')}</button>
      </div>
      {txns.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 10 }}>{t('suppliers.txn.noneYet')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
          {txns.map((tx) => (
            <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
              <span>
                <b style={{ color: tx.type === 'payment' ? 'var(--success)' : 'var(--danger)' }}>{TXN_LABEL[tx.type]}</b>
                {tx.note ? <span style={{ color: 'var(--text-muted)' }}> — {tx.note}</span> : null}
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatDateTime(tx.createdAt)}</div>
              </span>
              <b>
                {formatMoney(tx.amount)}
                {tx.type === 'purchase' && tx.paid != null && tx.paid > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>{t('suppliers.txn.paid', { n: formatMoney(tx.paid) })}</div>
                )}
              </b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function escS(s: string): string {
  return (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
