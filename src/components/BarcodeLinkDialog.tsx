'use client';

import { useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import { formatMoney } from '@/lib/branding';
import { addBarcodeToProduct } from '@/lib/products';
import type { Product } from '@/lib/types';
import { useLanguage } from '@/context/LanguageContext';

/**
 * عند مسح باركود غير مسجّل: ابحث عن المنتج بالاسم، ثم انقر على المنتج لربطه بالباركود فوراً.
 * onDone يتلقّى المنتج بعد التحديث (الطرف المستدعي يضيفه للسلة).
 */
export default function BarcodeLinkDialog({
  open,
  barcode,
  storeId,
  products,
  onDone,
  onClose,
}: {
  open: boolean;
  barcode: string;
  storeId: string;
  products: Product[];
  onDone: (product: Product) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [q, setQ] = useState('');
  const handleSelect = (p: Product) => {
    if (!p.barcodes.includes(barcode)) {
      addBarcodeToProduct(storeId, p.id, barcode);
      onDone({ ...p, barcodes: [...p.barcodes, barcode] });
    } else {
      onDone(p);
    }
  };

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products.slice(0, 25);
    return products
      .filter((p) => p.nameLower.includes(s) || p.category.toLowerCase().includes(s))
      .slice(0, 40);
  }, [products, q]);

  return (
    <Modal open={open} onClose={onClose} title={t('barcodeLink.title')} width={480}>
      <div style={{ fontSize: 14, lineHeight: 1.9, marginBottom: 10 }}>
        {t('barcodeLink.notRegisteredPrefix')} <b dir="ltr">{barcode}</b> {t('barcodeLink.notRegisteredSuffix')}
      </div>
      <input
        className="input"
        autoFocus
        placeholder={t('barcodeLink.searchPlaceholder')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      {results.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>{t('common.noResults')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: '#fff',
                textAlign: 'right',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>
                {p.category && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.category}</span>}
              </span>
              <span style={{ flexShrink: 0, fontWeight: 700, color: 'var(--primary)' }}>{formatMoney(p.unitSellPrice)}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
