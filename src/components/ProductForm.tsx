'use client';

import { useMemo, useState } from 'react';
import type { Product, ProductType } from '@/lib/types';
import { UNITS, profitMargin, unitPriceFromCarton } from '@/lib/types';
import type { ProductInput } from '@/lib/products';
import { isDuplicateName, findDuplicateBarcode } from '@/lib/products';
import { smartBarcodeConvert } from '@/lib/barcode';
import { isCapacitor } from '@/lib/env';
import { nativeScan } from '@/lib/scanner';
import { compressImage } from '@/lib/image';
import { branding } from '@/lib/branding';
import { useLanguage } from '@/context/LanguageContext';
import CameraScanner from './CameraScanner';
import CameraCapture from './CameraCapture';

const num = (s: string): number => {
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export default function ProductForm({
  editing,
  products,
  categories,
  onSubmit,
  onClose,
}: {
  editing?: Product | null;
  products: Product[];
  categories: string[];
  onSubmit: (input: ProductInput, id?: string) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [type, setType] = useState<ProductType>(editing?.type ?? 'carton');
  const [name, setName] = useState(editing?.name ?? '');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [barcodes, setBarcodes] = useState<string[]>(editing?.barcodes ?? []);
  const [barcodeInput, setBarcodeInput] = useState('');

  const [unitsPerCarton, setUnitsPerCarton] = useState(String(editing?.unitsPerCarton ?? ''));
  const [cartonPrice, setCartonPrice] = useState(String(editing?.cartonPurchasePrice ?? ''));
  const [unitPurchase, setUnitPurchase] = useState(String(editing?.unitPurchasePrice ?? ''));
  const [sellPrice, setSellPrice] = useState(String(editing?.unitSellPrice ?? ''));

  const [stock, setStock] = useState(String(editing?.stock ?? ''));
  const [minStock, setMinStock] = useState(String(editing?.minStock ?? ''));
  const [unit, setUnit] = useState(editing?.unit ?? UNITS[0]);
  const [expiry, setExpiry] = useState(editing?.expiry ?? '');
  const [error, setError] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [image, setImage] = useState(editing?.image ?? '');
  const [imgBusy, setImgBusy] = useState(false);

  async function compressToImage(blob: Blob) {
    setImgBusy(true);
    setError('');
    try {
      setImage(await compressImage(blob));
    } catch {
      setError(t('productForm.imgError'));
    } finally {
      setImgBusy(false);
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) await compressToImage(f);
  }

  // سعر شراء الوحدة المحسوب: للكرتونة = سعر الكرتونة ÷ عدد الوحدات، للوحدة = مباشر.
  const computedUnitPurchase = useMemo(() => {
    if (type === 'carton') return unitPriceFromCarton(num(cartonPrice), num(unitsPerCarton));
    return num(unitPurchase);
  }, [type, cartonPrice, unitsPerCarton, unitPurchase]);

  const margin = useMemo(
    () => profitMargin(num(sellPrice), computedUnitPurchase),
    [sellPrice, computedUnitPurchase],
  );

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

  // الهاتف → ML Kit الأصلي (سريع، يغلق بعد المسح)؛ الحاسوب/الويب → ZXing.
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

    const trimmedName = name.trim();
    if (!trimmedName) return setError(t('productForm.nameRequired'));
    if (isDuplicateName(products, trimmedName, editing?.id))
      return setError(t('productForm.duplicateName'));

    // ضمّ أي باركود مكتوب ولم يُضَف بعد (مع التحويل الذكي).
    const allBarcodes = [...barcodes];
    const leftover = smartBarcodeConvert(barcodeInput).trim();
    if (leftover && !allBarcodes.includes(leftover)) allBarcodes.push(leftover);

    const dupBc = findDuplicateBarcode(products, allBarcodes, editing?.id);
    if (dupBc) return setError(t('productForm.duplicateBarcode', { code: dupBc }));

    if (type === 'carton') {
      if (num(unitsPerCarton) <= 0) return setError(t('productForm.unitsPerCartonRequired'));
    }
    if (num(sellPrice) <= 0) return setError(t('productForm.sellPriceRequired'));

    const input: ProductInput = {
      name: trimmedName,
      category: category.trim(),
      barcodes: allBarcodes,
      type,
      unitsPerCarton: type === 'carton' ? num(unitsPerCarton) : undefined,
      cartonPurchasePrice: type === 'carton' ? num(cartonPrice) : undefined,
      unitPurchasePrice: computedUnitPurchase,
      unitSellPrice: num(sellPrice),
      stock: num(stock),
      minStock: num(minStock),
      unit,
      expiry: expiry || null,
      image: image || '',
    };

    onSubmit(input, editing?.id);
  }

  const label: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-muted)',
    marginBottom: 4,
    display: 'block',
  };
  const row: React.CSSProperties = { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
      {/* صورة المنتج (مضغوطة جداً) */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 8,
            border: '1px solid var(--border)',
            overflow: 'hidden',
            display: 'grid',
            placeItems: 'center',
            background: '#f8fafc',
            flexShrink: 0,
          }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 24, opacity: 0.4 }}>🖼️</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label
            className="btn-outline"
            style={{ cursor: 'pointer', padding: '8px 14px', background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)', borderRadius: 'var(--radius)' }}
          >
            {imgBusy ? '…' : image ? t('productForm.changeImage') : t('productForm.fromGallery')}
            <input type="file" accept="image/*" hidden onChange={onPickImage} />
          </label>
          <button
            type="button"
            onClick={() => setCamOpen(true)}
            className="btn-outline"
            style={{ padding: '8px 14px', background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)', borderRadius: 'var(--radius)' }}
          >
            {t('productForm.camera')}
          </button>
          {image && (
            <button
              type="button"
              onClick={() => setImage('')}
              style={{ padding: '8px 12px', border: '1.5px solid #fecaca', background: '#fef2f2', color: 'var(--danger)', borderRadius: 'var(--radius)', fontWeight: 700 }}
            >
              {t('productForm.deleteImage')}
            </button>
          )}
        </div>
      </div>

      {/* اختيار النوع */}
      <div>
        <span style={label}>{t('productForm.saleType')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {(
            [
              { v: 'carton', t: t('productForm.cartonToUnit'), d: t('productForm.cartonToUnitDesc') },
              { v: 'unit', t: t('productForm.unitToUnit'), d: t('productForm.unitToUnitDesc') },
            ] as const
          ).map((opt) => (
            <button
              type="button"
              key={opt.v}
              onClick={() => setType(opt.v)}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 'var(--radius)',
                border: `1.5px solid ${type === opt.v ? 'var(--primary)' : 'var(--border)'}`,
                background: type === opt.v ? 'rgba(15,118,110,0.08)' : '#fff',
                textAlign: 'center',
              }}
            >
              <div style={{ fontWeight: 700, color: type === opt.v ? 'var(--primary)' : 'var(--text)' }}>
                {opt.t}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{opt.d}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={row}>
        <div>
          <label style={label}>{t('productForm.name')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label style={label}>{t('productForm.category')}</label>
          <input
            className="input"
            list="cat-list"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id="cat-list">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      {/* الباركود (متعدد) */}
      <div>
        <label style={label}>{t('productForm.barcode')}</label>
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
            placeholder={t('productForm.barcodePlaceholder')}
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
            title={t('productForm.scanCamera')}
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

      {/* الأسعار — حقول ديناميكية حسب النوع */}
      {type === 'carton' ? (
        <div style={row}>
          <div>
            <label style={label}>{t('productForm.unitsPerCarton')}</label>
            <input
              className="input"
              type="number"
              min={1}
              value={unitsPerCarton}
              onChange={(e) => setUnitsPerCarton(e.target.value)}
            />
          </div>
          <div>
            <label style={label}>{t('productForm.cartonPurchasePrice')}</label>
            <input
              className="input"
              type="number"
              min={0}
              value={cartonPrice}
              onChange={(e) => setCartonPrice(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div>
          <label style={label}>{t('productForm.unitPurchasePrice')}</label>
          <input
            className="input"
            type="number"
            min={0}
            value={unitPurchase}
            onChange={(e) => setUnitPurchase(e.target.value)}
          />
        </div>
      )}

      <div style={row}>
        <div>
          <label style={label}>{t('productForm.unitSellPrice')}</label>
          <input
            className="input"
            type="number"
            min={0}
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
          />
        </div>
        <div>
          <label style={label}>{t('productForm.unit')}</label>
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ملخّص محسوب تلقائياً */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          background: '#f8fafc',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          fontSize: 14,
        }}
      >
        <div>
          {t('productForm.computedPurchasePrice')}{' '}
          <b>
            {computedUnitPurchase.toFixed(2)} {branding.currency.symbol}
          </b>
        </div>
        <div>
          {t('productForm.margin')}{' '}
          <b style={{ color: margin >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {margin.toFixed(1)}%
          </b>
        </div>
      </div>

      <div style={row}>
        <div>
          <label style={label}>{t('productForm.stock')}</label>
          <input
            className="input"
            type="number"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </div>
        <div>
          <label style={label}>{t('productForm.minStock')}</label>
          <input
            className="input"
            type="number"
            min={0}
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label style={label}>{t('productForm.expiry')}</label>
        <input
          className="input"
          type="date"
          value={expiry ?? ''}
          onChange={(e) => setExpiry(e.target.value)}
        />
      </div>

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 14, fontWeight: 600 }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button type="submit" className="btn">
          {editing ? t('productForm.saveChanges') : t('productForm.addProduct')}
        </button>
        <button
          type="button"
          className="btn-outline"
          onClick={onClose}
          style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)' }}
        >
          {t('common.cancel')}
        </button>
      </div>

      {/* ماسح الكاميرا (ويب) — يغلق بعد أول مسح */}
      <CameraScanner
        open={scanOpen}
        onScan={(code) => {
          addBarcodeValue(code);
          import('@/lib/sound').then(({ beep, vibrate }) => {
            beep(1);
            vibrate();
          });
        }}
        onClose={() => setScanOpen(false)}
      />

      {/* التقاط صورة المنتج بالكاميرا */}
      <CameraCapture open={camOpen} onCapture={(blob) => compressToImage(blob)} onClose={() => setCamOpen(false)} />
    </form>
  );
}
