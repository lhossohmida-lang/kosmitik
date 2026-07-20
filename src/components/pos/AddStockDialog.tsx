'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import type { Product } from '@/lib/types';
import { useLanguage } from '@/context/LanguageContext';

/** إضافة كمية سريعة لمنتج نافد — دون مغادرة شاشة البيع (بلا كلمة سر). */
export default function AddStockDialog({
  open,
  product,
  onConfirm,
  onClose,
}: {
  open: boolean;
  product: Product | null;
  onConfirm: (qty: number) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [qty, setQty] = useState('');
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) return setError(t('addStock.qtyRequired'));
    onConfirm(q);
    setQty('');
  }

  return (
    <Modal open={open} onClose={onClose} title={t('addStock.title', { name: product?.name ?? '' })} width={380}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{t('addStock.qtyLabel')}</label>
          <input
            className="input"
            type="number"
            min={1}
            autoFocus
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        <button className="btn" type="submit">
          {t('addStock.submit')}
        </button>
      </form>
    </Modal>
  );
}
