'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { branding, formatMoney } from '@/lib/branding';
import {
  type Product,
  profitMargin,
  stockStatus,
  stockDisplay,
  isNearExpiry,
} from '@/lib/types';
import {
  saveProduct,
  deleteProduct,
  patchProduct,
  type ProductInput,
} from '@/lib/products';
import { useProducts } from '@/lib/productStore';
import { printHtml, printProductLabel } from '@/lib/print';
import { isCapacitor } from '@/lib/env';
import { nativeScan } from '@/lib/scanner';
import { useUsbScanner } from '@/hooks/useUsbScanner';
import Modal from '@/components/Modal';
import ProductForm from '@/components/ProductForm';
import ConfirmDialog from '@/components/ConfirmDialog';
import ImportProductsDialog from '@/components/ImportProductsDialog';
import ImportBarcodesDialog from '@/components/ImportBarcodesDialog';
import CameraScanner from '@/components/CameraScanner';
import BarcodeLinkDialog from '@/components/BarcodeLinkDialog';

type Filter = 'all' | 'out' | 'low' | 'expiry';

/** أقصى عدد بطاقات تُرسم دفعةً (يمنع التجمّد مع آلاف المنتجات). */
const RENDER_CAP = 120;

export default function ProductsPage() {
  const { storeId } = useAuth();
  const { t, lang, dir } = useLanguage();
  // مخزن مشترك: معاينة الكاش فوراً ثم الكل بالخلفية — بلا إعادة تحميل عند كل دخول.
  const { products, stats, ready } = useProducts(storeId);
  const fullReady = ready;
  const loading = !ready && products.length === 0;
  const loadError = '';

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [barcodeImportOpen, setBarcodeImportOpen] = useState(false);
  const [importDropOpen, setImportDropOpen] = useState(false);
  const importDropRef = useRef<HTMLDivElement>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [linkBarcode, setLinkBarcode] = useState<string | null>(null);

  const anyModalOpen = formOpen || bulkOpen || importOpen || barcodeImportOpen || scanOpen || !!linkBarcode || !!toDelete;

  // مسح باركود في المخزون: موجود → يُصفّي إليه؛ غير موجود → بطاقة ربط بمنتج.
  function handleScan(code: string) {
    const p = products.find((pr) => pr.barcodes.includes(code));
    if (p) setSearch(code);
    else setLinkBarcode(code);
  }

  async function openScanner() {
    if (isCapacitor()) {
      try {
        const code = await nativeScan();
        if (code) handleScan(code);
        return;
      } catch {
        /* بديل الويب */
      }
    }
    setScanOpen(true);
  }

  // قارئ USB على صفحة المخزون (يُعطَّل عند فتح أي نافذة).
  useUsbScanner({ onScan: handleScan, enabled: !anyModalOpen });

  // إغلاق قائمة الاستيراد عند الضغط خارجها
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (importDropRef.current && !importDropRef.current.contains(e.target as Node)) {
        setImportDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function printList() {
    const rows = filtered
      .map(
        (p) =>
          `<tr><td>${escapeHtmlP(p.name)}</td><td>${escapeHtmlP(p.category)}</td><td style="text-align:center">${p.stock}</td><td style="text-align:left">${p.unitSellPrice.toFixed(2)}</td></tr>`,
      )
      .join('');
    printHtml(`<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8">
      <style>body{font-family:'Segoe UI',Tahoma,sans-serif;padding:16px;color:#000}
      table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #ccc;padding:6px;text-align:${dir === 'rtl' ? 'right' : 'left'}}</style>
      </head><body><h2>${branding.storeName} — ${t('products.printHeader')}</h2>
      <table><thead><tr><th>${t('products.printCol.name')}</th><th>${t('products.printCol.category')}</th><th>${t('products.printCol.stock')}</th><th>${t('products.printCol.price')}</th></tr></thead><tbody>${rows}</tbody></table>
      </body></html>`);
  }

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (filter === 'out' && stockStatus(p) !== 'out') return false;
      if (filter === 'low' && stockStatus(p) !== 'low') return false;
      if (filter === 'expiry' && !isNearExpiry(p)) return false;
      if (!q) return true;
      return (
        p.nameLower.includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.barcodes.some((b) => b.includes(q))
      );
    });
  }, [products, search, filter]);

  function handleSubmit(input: ProductInput, id?: string) {
    if (!storeId) return;
    saveProduct(storeId, input, id);
    setFormOpen(false);
    setEditing(null);
  }

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    setFormOpen(true);
  }

  return (
    <div>
      {/* شريط علوي: بحث + إضافة */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder={t('products.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn" onClick={openScanner} title={t('products.scanBarcode')}>{t('products.scan')}</button>
        <div ref={importDropRef} style={{ position: 'relative' }}>
          <button className="btn" onClick={() => setImportDropOpen((v) => !v)} title={t('products.importCsv')}>{t('products.import')}</button>
          {importDropOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', insetInlineEnd: 0, minWidth: 200, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 60 }}>
              <button
                onMouseDown={(e) => { e.preventDefault(); setImportOpen(true); setImportDropOpen(false); }}
                style={{ display: 'block', width: '100%', padding: '10px 14px', textAlign: 'start', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, borderBottom: '1px solid var(--border)' }}
              >
                {t('products.importProducts')}
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); setBarcodeImportOpen(true); setImportDropOpen(false); }}
                style={{ display: 'block', width: '100%', padding: '10px 14px', textAlign: 'start', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
              >
                {t('products.importBarcodes')}
              </button>
            </div>
          )}
        </div>
        <button className="btn" onClick={() => setBulkOpen(true)} title={t('products.bulkEdit')}>{t('products.bulkEdit')}</button>
        <button className="btn" onClick={printList} title={t('products.printListTitle')}>🖨️</button>
        <button className="btn" onClick={openAdd}>
          {t('products.addProduct')}
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        {t('products.quickHint')}
      </div>

      {/* بطاقات الإحصاء (قابلة للنقر للتصفية) */}
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          marginBottom: 16,
        }}
      >
        <StatCard label={t('products.stat.value')} value={fullReady ? formatMoney(stats.value) : '…'} icon="💰" />
        <StatCard label={t('products.stat.count')} value={fullReady ? String(stats.count) : '…'} icon="📦" />
        <StatCard
          label={t('products.stat.out')}
          value={fullReady ? String(stats.out) : '…'}
          icon="⛔"
          active={filter === 'out'}
          onClick={() => setFilter(filter === 'out' ? 'all' : 'out')}
          color="var(--danger)"
        />
        <StatCard
          label={t('products.stat.low')}
          value={fullReady ? String(stats.low) : '…'}
          icon="⚠️"
          active={filter === 'low'}
          onClick={() => setFilter(filter === 'low' ? 'all' : 'low')}
          color="var(--accent)"
        />
        <StatCard
          label={t('products.stat.expiry')}
          value={fullReady ? String(stats.expiry) : '…'}
          icon="⏳"
          active={filter === 'expiry'}
          onClick={() => setFilter(filter === 'expiry' ? 'all' : 'expiry')}
          color="#7c3aed"
        />
      </div>

      {filter !== 'all' && (
        <div style={{ marginBottom: 12 }}>
          <button className="btn-outline" onClick={() => setFilter('all')} style={{ fontSize: 13, padding: '6px 12px' }}>
            {t('products.clearFilter')}
          </button>
        </div>
      )}

      {loadError && (
        <div className="card" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b' }}>
          {loadError}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
          {products.length === 0 ? t('products.noProductsYet') : t('products.noMatches')}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          }}
        >
          {filtered.slice(0, RENDER_CAP).map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              onEdit={() => openEdit(p)}
              onDelete={() => setToDelete(p)}
              onToggleQuick={() => storeId && patchProduct(storeId, p.id, { quickAccess: !p.quickAccess })}
            />
          ))}
        </div>
      )}

      {filtered.length > RENDER_CAP && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>
          {t('products.showingCap', { cap: RENDER_CAP, total: filtered.length })}
        </div>
      )}

      {/* نافذة الإضافة/التعديل */}
      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? t('products.editProduct') : t('products.addProductTitle')}
        width={640}
      >
        <ProductForm
          editing={editing}
          products={products}
          categories={categories}
          onSubmit={handleSubmit}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      </Modal>

      {/* تأكيد الحذف */}
      <ConfirmDialog
        open={!!toDelete}
        title={t('products.deleteProduct')}
        message={t('products.deleteConfirmMsg', { name: toDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          if (storeId && toDelete) deleteProduct(storeId, toDelete.id);
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      />

      {/* تعديل جماعي للمخزون + الأزرار السريعة */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title={t('products.bulkEditTitle')} width={620}>
        <BulkEdit
          products={filtered}
          onSave={(changes) => {
            if (storeId) changes.forEach((c) => patchProduct(storeId, c.id, { stock: c.stock, quickAccess: c.quickAccess }));
            setBulkOpen(false);
          }}
          onDelete={(ids) => {
            if (storeId) ids.forEach((id) => deleteProduct(storeId, id));
            setBulkOpen(false);
          }}
          onClose={() => setBulkOpen(false)}
        />
      </Modal>

      {/* استيراد منتجات من ملف CSV */}
      {storeId && (
        <ImportProductsDialog
          open={importOpen}
          storeId={storeId}
          existingProducts={products}
          onClose={() => setImportOpen(false)}
          onDone={() => {}}
        />
      )}

      {/* استيراد باركودات من ملف CSV */}
      {storeId && (
        <ImportBarcodesDialog
          open={barcodeImportOpen}
          storeId={storeId}
          existingProducts={products}
          onClose={() => setBarcodeImportOpen(false)}
          onDone={() => {}}
        />
      )}

      {/* ماسح كاميرا الويب للمخزون */}
      <CameraScanner open={scanOpen} onScan={handleScan} onClose={() => setScanOpen(false)} />

      {/* باركود غير موجود → بطاقة تعديل كاملة لإضافة الباركود لمنتج موجود */}
      {linkBarcode && storeId && (
        <BarcodeLinkDialog
          open
          barcode={linkBarcode}
          storeId={storeId}
          products={products}
          onDone={(p) => {
            setLinkBarcode(null);
            setSearch(p.nameLower);
          }}
          onClose={() => setLinkBarcode(null)}
        />
      )}
    </div>
  );
}

function escapeHtmlP(s: string): string {
  return (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function BulkEdit({
  products,
  onSave,
  onDelete,
  onClose,
}: {
  products: Product[];
  onSave: (changes: { id: string; stock: number; quickAccess: boolean }[]) => void;
  onDelete: (ids: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [rows, setRows] = useState(
    products.map((p) => ({ id: p.id, name: p.name, stock: p.stock, quickAccess: !!p.quickAccess, sel: false })),
  );
  const [confirmDel, setConfirmDel] = useState(false);
  const selectedIds = rows.filter((r) => r.sel).map((r) => r.id);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
        {t('products.bulkHint')}
      </div>

      {/* رأس: تحديد الكل */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', borderBottom: '1px solid var(--border)', marginBottom: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
          <input type="checkbox" checked={allSelected} onChange={() => setRows((p) => p.map((x) => ({ ...x, sel: !allSelected })))} />
          {t('products.selectAllCount', { sel: selectedIds.length, total: rows.length })}
        </label>
      </div>

      <div style={{ display: 'grid', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
        {rows.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, background: r.sel ? '#fff1f2' : '#fff' }}>
            <input type="checkbox" checked={r.sel} onChange={(e) => setRows((p) => p.map((x, idx) => (idx === i ? { ...x, sel: e.target.checked } : x)))} />
            <span style={{ flex: 1, fontSize: 14 }}>{r.name}</span>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={r.quickAccess} onChange={(e) => setRows((p) => p.map((x, idx) => (idx === i ? { ...x, quickAccess: e.target.checked } : x)))} />
              {t('products.quick')}
            </label>
            <input
              type="number"
              value={r.stock}
              onChange={(e) => setRows((p) => p.map((x, idx) => (idx === i ? { ...x, stock: Number(e.target.value) } : x)))}
              style={{ width: 80, border: '1px solid var(--border)', borderRadius: 8, padding: '4px 6px', textAlign: 'center' }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => onSave(rows)}>{t('products.saveChanges')}</button>
        <button
          onClick={() => setConfirmDel(true)}
          disabled={selectedIds.length === 0}
          style={{ padding: '10px 16px', borderRadius: 'var(--radius)', border: 'none', fontWeight: 700, background: selectedIds.length ? 'var(--danger)' : '#e2e8f0', color: '#fff', cursor: selectedIds.length ? 'pointer' : 'not-allowed' }}
        >
          {t('products.deleteSelectedCount', { n: selectedIds.length })}
        </button>
        <button className="btn-outline" onClick={onClose} style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}>{t('common.close')}</button>
      </div>

      <ConfirmDialog
        open={confirmDel}
        title={t('products.deleteProductsTitle')}
        message={t('products.deleteManyConfirm', { n: selectedIds.length })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => { onDelete(selectedIds); setConfirmDel(false); }}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  active,
  onClick,
  color,
}: {
  label: string;
  value: string;
  icon: string;
  active?: boolean;
  onClick?: () => void;
  color?: string;
}) {
  return (
    <div
      onClick={onClick}
      className="card"
      style={{
        cursor: onClick ? 'pointer' : 'default',
        borderColor: active ? (color ?? 'var(--primary)') : 'var(--border)',
        borderWidth: active ? 2 : 1,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{label}</div>
      <FitText text={value} color={color ?? 'var(--text)'} />
    </div>
  );
}

/** يعرض النص كاملاً بتصغير الخط تلقائياً ليتّسع داخل البطاقة (لا قصّ للأرقام الكبيرة). */
function FitText({ text, color, maxSize = 22, minSize = 10 }: { text: string; color?: string; maxSize?: number; minSize?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(maxSize);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let s = maxSize;
    el.style.fontSize = s + 'px';
    let guard = 0;
    while (el.scrollWidth > el.clientWidth && s > minSize && guard < 40) {
      s -= 1;
      el.style.fontSize = s + 'px';
      guard++;
    }
    setSize(s);
  }, [text, maxSize, minSize]);

  return (
    <div
      ref={ref}
      style={{ fontSize: size, fontWeight: 800, color: color ?? 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}
    >
      {text}
    </div>
  );
}

function ProductCard({ p, onEdit, onDelete, onToggleQuick }: { p: Product; onEdit: () => void; onDelete: () => void; onToggleQuick: () => void }) {
  const { t } = useLanguage();
  const status = stockStatus(p);
  const margin = profitMargin(p.unitSellPrice, p.unitPurchasePrice);
  const statusColor = status === 'out' ? 'var(--danger)' : status === 'low' ? 'var(--accent)' : 'var(--success)';
  const statusText = status === 'out' ? t('products.statusOut') : status === 'low' ? t('products.statusLow') : t('products.statusOk');

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, minWidth: 0, alignItems: 'center' }}>
          {p.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}
            </div>
            {p.category && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.category}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onToggleQuick}
            title={t('products.quickAccessTitle')}
            style={{ border: 'none', background: 'none', fontSize: 16, cursor: 'pointer', opacity: p.quickAccess ? 1 : 0.3 }}
          >
            ⭐
          </button>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: statusColor,
              background: `${statusColor}1a`,
              padding: '2px 8px',
              borderRadius: 999,
            }}
          >
            {statusText}
          </span>
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{stockDisplay(p)}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
        <span>
          {t('products.sellPrice')}: <b>{formatMoney(p.unitSellPrice)}</b>
        </span>
        <span style={{ color: 'var(--text-muted)' }}>
          {t('products.margin', { n: margin.toFixed(0) })}
        </span>
      </div>

      {p.barcodes.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }} dir="ltr">
          {p.barcodes[0]}
          {p.barcodes.length > 1 ? ` +${p.barcodes.length - 1}` : ''}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          className="btn-outline"
          onClick={onEdit}
          style={{ flex: 1, padding: '6px', fontSize: 13, background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}
        >
          {t('common.edit')}
        </button>
        <button
          onClick={() => printProductLabel(p)}
          title={t('products.printLabel')}
          style={{ padding: '6px 10px', fontSize: 14, fontWeight: 700, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text)', borderRadius: 'var(--radius)' }}
        >
          🏷️
        </button>
        <button
          onClick={onDelete}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 700,
            border: '1.5px solid #fecaca',
            background: '#fef2f2',
            color: 'var(--danger)',
            borderRadius: 'var(--radius)',
          }}
        >
          {t('common.delete')}
        </button>
      </div>
    </div>
  );
}
