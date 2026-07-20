'use client';

import { useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import { formatMoney } from '@/lib/branding';
import type { Product, ProductType } from '@/lib/types';
import type { ProductInput } from '@/lib/products';
import { smartBarcodeConvert } from '@/lib/barcode';
import { isCapacitor } from '@/lib/env';
import { nativeScan } from '@/lib/scanner';
import CameraScanner from '@/components/CameraScanner';
import { useLanguage } from '@/context/LanguageContext';

const num = (s: string) => {
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export interface AddPurchaseResult {
  productId: string;
  name: string;
  isCarton: boolean;
  unitsPerCarton: number;
  qty: number;
  cost: number;
  /** بيانات منتج جديد لإنشائه أولاً (غير موجود مسبقاً). */
  newProduct?: ProductInput;
}

/**
 * إضافة منتج إلى فاتورة الشراء:
 *  - اسم جديد → يُنشأ منتج جديد ثم يُضاف للفاتورة.
 *  - اسم موجود مسبقاً → تُضاف كمية بسعر (قد يكون مختلفاً) لنفس المنتج.
 */
export default function AddPurchaseProductDialog({
  open,
  products,
  onSubmit,
  onClose,
}: {
  open: boolean;
  products: Product[];
  onSubmit: (r: AddPurchaseResult) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<ProductType>('unit');
  const [unitsPerCarton, setUnitsPerCarton] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [cost, setCost] = useState('');
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [error, setError] = useState('');

  const existing = useMemo(() => {
    const key = name.trim().toLowerCase();
    return key ? products.find((p) => p.nameLower === key) ?? null : null;
  }, [name, products]);

  const isCarton = existing ? existing.type === 'carton' : type === 'carton';
  const upc = existing ? existing.unitsPerCarton || 1 : num(unitsPerCarton) || 1;

  // تحويل ذكي (يعالج رموز AZERTY من قارئ USB) ثم إضافة بلا تكرار.
  function addBarcodeValue(raw: string) {
    const b = smartBarcodeConvert(raw).trim();
    if (!b) return;
    setBarcodes((prev) => (prev.includes(b) ? prev : [...prev, b]));
  }

  function addBarcode() {
    addBarcodeValue(barcodeInput);
    setBarcodeInput('');
  }

  // الهاتف → ML Kit الأصلي (سريع)؛ الحاسوب/الويب → ZXing عبر CameraScanner.
  async function openScanner() {
    if (isCapacitor()) {
      try {
        const code = await nativeScan();
        if (code) addBarcodeValue(code);
        return;
      } catch {
        /* بديل الويب */
      }
    }
    setScanOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError(t('addPurchaseProduct.nameRequired'));
    const q = num(qty);
    const c = num(cost);
    if (q <= 0) return setError(t('addPurchaseProduct.qtyRequired'));
    if (isCarton && (num(unitsPerCarton) <= 0 && !existing)) return setError(t('addPurchaseProduct.unitsPerCartonRequired'));

    if (existing) {
      onSubmit({ productId: existing.id, name: existing.name, isCarton, unitsPerCarton: upc, qty: q, cost: c });
    } else {
      const allBarcodes = [...barcodes];
      const leftover = smartBarcodeConvert(barcodeInput).trim();
      if (leftover && !allBarcodes.includes(leftover)) allBarcodes.push(leftover);

      const newProduct: ProductInput = {
        name: name.trim(),
        category: category.trim(),
        barcodes: allBarcodes,
        type,
        unitsPerCarton: type === 'carton' ? num(unitsPerCarton) : undefined,
        cartonPurchasePrice: type === 'carton' ? c : undefined,
        unitPurchasePrice: type === 'carton' ? (num(unitsPerCarton) ? c / num(unitsPerCarton) : 0) : c,
        unitSellPrice: num(sellPrice),
        stock: 0,
        minStock: 0,
        unit: 'قطعة',
        expiry: null,
        quickAccess: false,
        image: '',
      };
      onSubmit({ productId: '', name: name.trim(), isCarton, unitsPerCarton: upc, qty: q, cost: c, newProduct });
    }
  }

  const label: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 };

  return (
    <Modal open={open} onClose={onClose} title={t('addPurchaseProduct.title')} width={480}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <div>
          <label style={label}>{t('addPurchaseProduct.name')}</label>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('addPurchaseProduct.namePlaceholder')} />
          {existing ? (
            <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>
              {t('addPurchaseProduct.existingNote', { stock: existing.stock })}
            </div>
          ) : name.trim() ? (
            <div style={{ fontSize: 12, color: 'var(--primary)', marginTop: 4 }}>{t('addPurchaseProduct.newNote')}</div>
          ) : null}
        </div>

        {!existing && (
          <>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label style={label}>{t('addPurchaseProduct.category')}</label>
                <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} />
              </div>
              <div>
                <label style={label}>{t('addPurchaseProduct.sellPrice')}</label>
                <input className="input" type="number" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
              </div>
            </div>

            <div>
              <label style={label}>{t('addPurchaseProduct.barcode')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addBarcode();
                    }
                  }}
                  placeholder={t('addPurchaseProduct.barcodePlaceholder')}
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                />
                <button type="button" className="btn-outline" onClick={addBarcode}>
                  {t('common.add')}
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={openScanner}
                  title={t('addPurchaseProduct.scanCamera')}
                  style={{ padding: '0 12px' }}
                >
                  📷
                </button>
              </div>
              {barcodes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {barcodes.map((b) => (
                    <span
                      key={b}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#f1f5f9',
                        borderRadius: 999,
                        padding: '3px 10px',
                        fontSize: 13,
                      }}
                      dir="ltr"
                    >
                      {b}
                      <button
                        type="button"
                        onClick={() => setBarcodes(barcodes.filter((x) => x !== b))}
                        style={{ border: 'none', background: 'none', color: 'var(--danger)', fontWeight: 800 }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {(['unit', 'carton'] as const).map((v) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setType(v)}
                  style={{ flex: 1, padding: 8, borderRadius: 'var(--radius)', border: `1.5px solid ${type === v ? 'var(--primary)' : 'var(--border)'}`, background: type === v ? 'rgba(15,118,110,0.08)' : '#fff', fontWeight: 700, color: type === v ? 'var(--primary)' : 'var(--text)' }}
                >
                  {v === 'unit' ? t('addPurchaseProduct.unit') : t('addPurchaseProduct.carton')}
                </button>
              ))}
            </div>
            {type === 'carton' && (
              <div>
                <label style={label}>{t('addPurchaseProduct.unitsPerCarton')}</label>
                <input className="input" type="number" value={unitsPerCarton} onChange={(e) => setUnitsPerCarton(e.target.value)} />
              </div>
            )}
          </>
        )}

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <label style={label}>{isCarton ? t('addPurchaseProduct.cartonCount') : t('addPurchaseProduct.qty')}</label>
            <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label style={label}>{isCarton ? t('addPurchaseProduct.cartonPrice') : t('addPurchaseProduct.purchasePrice')}</label>
            <input className="input" type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {t('addPurchaseProduct.total')} <b>{formatMoney(num(qty) * num(cost))}</b>
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" type="submit">{t('addPurchaseProduct.addToInvoice')}</button>
          <button type="button" className="btn-outline" onClick={onClose} style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}>{t('common.cancel')}</button>
        </div>
      </form>

      {/* ماسح كاميرا الويب للباركود */}
      <CameraScanner open={scanOpen} onScan={(code) => addBarcodeValue(code)} onClose={() => setScanOpen(false)} />
    </Modal>
  );
}
