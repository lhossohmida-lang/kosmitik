'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { branding, formatMoney } from '@/lib/branding';
import { publishPublicCatalog, statusLabel, subscribeStoreOrders, updateStoreOrder } from '@/lib/orders';
import { subscribeProducts } from '@/lib/products';
import { recordSale, type SaleInput } from '@/lib/sales';
import type { Product, SaleItem, StoreOrder, StoreOrderStatus } from '@/lib/types';

type Filter = StoreOrderStatus | 'all';

const statusColors: Record<StoreOrderStatus, { bg: string; fg: string }> = {
  new: { bg: '#fef3c7', fg: '#92400e' },
  accepted: { bg: '#dbeafe', fg: '#1d4ed8' },
  done: { bg: '#dcfce7', fg: '#166534' },
  cancelled: { bg: '#fee2e2', fg: '#991b1b' },
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function StorePage() {
  const { storeId } = useAuth();
  const { t, lang } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [productsReady, setProductsReady] = useState(false);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [filter, setFilter] = useState<Filter>('new');
  const [origin, setOrigin] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!storeId) return;
    const unsubProducts = subscribeProducts(storeId, (items) => {
      setProducts(items);
      setProductsReady(true);
    });
    const unsubOrders = subscribeStoreOrders(storeId, setOrders);
    return () => {
      unsubProducts();
      unsubOrders();
    };
  }, [storeId]);

  const syncKey = useMemo(
    () => products.map((p) => `${p.id}:${p.updatedAt}:${p.stock}:${p.unitSellPrice}:${p.image ? 1 : 0}`).join('|'),
    [products],
  );

  useEffect(() => {
    if (!storeId || !productsReady) return;
    const timer = window.setTimeout(() => publishPublicCatalog(storeId, products), 450);
    return () => window.clearTimeout(timer);
  }, [storeId, productsReady, products, syncKey]);

  const shopLink = storeId && origin ? `${origin}/shop?storeId=${storeId}` : '';
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const filteredOrders = useMemo(
    () => (filter === 'all' ? orders : orders.filter((order) => order.status === filter)),
    [orders, filter],
  );

  const counts = useMemo(() => {
    const base: Record<Filter, number> = { all: orders.length, new: 0, accepted: 0, done: 0, cancelled: 0 };
    orders.forEach((order) => {
      base[order.status] += 1;
    });
    return base;
  }, [orders]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  }

  function copyLink() {
    if (!shopLink) return;
    navigator.clipboard
      ?.writeText(shopLink)
      .then(() => flash(t('store.toast.linkCopied')))
      .catch(() => flash(t('store.toast.copyManually')));
  }

  function syncNow() {
    if (!storeId) return;
    publishPublicCatalog(storeId, products);
    flash(t('store.toast.catalogUpdated'));
  }

  function acceptOrder(order: StoreOrder) {
    if (!storeId || order.status !== 'new') return;

    const unavailable = order.items.find((item) => {
      const product = productMap.get(item.productId);
      return !product || product.stock < item.qty;
    });
    if (unavailable) {
      flash(t('store.toast.insufficientStock', { name: unavailable.name }));
      return;
    }

    const items: SaleItem[] = order.items.map((item) => {
      const product = productMap.get(item.productId);
      return {
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        unitSellPrice: item.unitSellPrice,
        unitPurchasePrice: product?.unitPurchasePrice ?? 0,
        lineTotal: item.lineTotal,
      };
    });
    const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
    const input: SaleInput = {
      items,
      subtotal,
      discount: 0,
      total: subtotal,
      payment: 'cash',
      customerId: null,
      customerName: order.customerName,
    };

    const saleId = recordSale(storeId, input);
    updateStoreOrder(storeId, order.id, { status: 'accepted', saleId });
    flash(t('store.toast.orderConfirmed'));
  }

  function setStatus(order: StoreOrder, status: StoreOrderStatus) {
    if (!storeId) return;
    updateStoreOrder(storeId, order.id, { status });
    flash(status === 'done' ? t('store.toast.markedDelivered') : t('store.toast.orderUpdated'));
  }

  return (
    <div className="store-page">
      <section className="store-header">
        <div>
          <h1>{t('store.title')}</h1>
          <p>{t('store.subtitle')}</p>
        </div>
        <div className="link-box">
          <input className="input" readOnly value={shopLink || t('store.linkPreparing')} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn" onClick={copyLink} disabled={!shopLink}>
            {t('store.copyLink')}
          </button>
          <button className="btn-outline link-open" onClick={() => shopLink && window.open(shopLink, '_blank')} disabled={!shopLink}>
            {t('store.open')}
          </button>
        </div>
      </section>

      <section className="stats-row">
        <Stat label={t('store.newOrders')} value={counts.new} tone="#be185d" />
        <Stat label={t('store.confirmed')} value={counts.accepted} tone="#2563eb" />
        <Stat label={t('store.delivered')} value={counts.done} tone="#16a34a" />
        <Stat label={t('store.linkProducts')} value={products.length} tone="var(--primary)" />
      </section>

      <section className="orders-section">
        <div className="section-head">
          <h2>{t('store.orders')}</h2>
          <div className="filters">
            {(['new', 'accepted', 'done', 'cancelled', 'all'] as Filter[]).map((f) => (
              <button key={f} className={filter === f ? 'filter active' : 'filter'} onClick={() => setFilter(f)}>
                {f === 'all' ? t('store.all') : statusLabel(f, lang)} <span>{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="card empty">{t('store.noOrdersHere')}</div>
        ) : (
          <div className="order-grid">
            {filteredOrders.map((order) => {
              const colors = statusColors[order.status];
              return (
                <article key={order.id} className="order-card">
                  <div className="order-top">
                    <div>
                      <b>{order.customerName}</b>
                      <div className="muted">{order.phone}</div>
                    </div>
                    <span className="status" style={{ background: colors.bg, color: colors.fg }}>
                      {statusLabel(order.status, lang)}
                    </span>
                  </div>

                  <div className="order-meta">
                    <span>{new Date(order.createdAt).toLocaleString(lang === 'ar' ? 'ar-DZ' : 'fr-FR')}</span>
                    {order.address && <span>{order.address}</span>}
                  </div>

                  <div className="order-items">
                    {order.items.map((item) => (
                      <div key={item.productId} className="order-item">
                        <span>{item.name}</span>
                        <b>
                          {item.qty} × {formatMoney(item.unitSellPrice)}
                        </b>
                      </div>
                    ))}
                  </div>

                  {order.note && <div className="note">{order.note}</div>}

                  <div className="order-total">
                    <span>{t('store.total')}</span>
                    <strong>{formatMoney(order.total)}</strong>
                  </div>

                  <div className="order-actions">
                    {order.status === 'new' && (
                      <>
                        <button className="btn" onClick={() => acceptOrder(order)}>
                          {t('store.confirmAndDeduct')}
                        </button>
                        <button className="danger-btn" onClick={() => setStatus(order, 'cancelled')}>
                          {t('store.cancel')}
                        </button>
                      </>
                    )}
                    {order.status === 'accepted' && (
                      <>
                        <button className="btn" onClick={() => setStatus(order, 'done')}>
                          {t('store.markDelivered')}
                        </button>
                        <button className="danger-btn" onClick={() => setStatus(order, 'cancelled')}>
                          {t('store.cancel')}
                        </button>
                      </>
                    )}
                    {order.saleId && <span className="sale-id">{t('store.invoiceShort', { n: order.saleId.slice(0, 6) })}</span>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="catalog-section">
        <div className="section-head">
          <h2>{t('store.catalogTitle')}</h2>
          <button className="btn-outline" onClick={syncNow}>
            {t('store.syncNow')}
          </button>
        </div>
        {products.length === 0 ? (
          <div className="card empty">{t('store.noProductsYet')}</div>
        ) : (
          <div className="preview-grid">
            {products.slice(0, 12).map((p) => (
              <div key={p.id} className="preview-product">
                <div className="preview-image">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" />
                  ) : (
                    <span>{branding.storeName.slice(0, 1)}</span>
                  )}
                </div>
                <div>
                  <b>{p.name}</b>
                  <span>{formatMoney(p.unitSellPrice)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {toast && <div className="toast">{toast}</div>}

      <style jsx>{`
        .store-page {
          display: grid;
          gap: 16px;
          max-width: 1180px;
          margin: 0 auto;
        }
        .store-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 520px);
          gap: 16px;
          align-items: end;
        }
        h1,
        h2 {
          line-height: 1.2;
        }
        .store-header p,
        .muted,
        .order-meta,
        .preview-product span {
          color: var(--text-muted);
          font-size: 13px;
        }
        .link-box {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 8px;
        }
        .link-open {
          padding-inline: 14px;
        }
        .stats-row {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .stat {
          background: #fff;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 14px;
          box-shadow: var(--shadow);
        }
        .stat b {
          display: block;
          font-size: 28px;
          line-height: 1;
        }
        .stat span {
          color: var(--text-muted);
          font-size: 13px;
        }
        .orders-section,
        .catalog-section {
          display: grid;
          gap: 12px;
        }
        .section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .filters {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 2px;
        }
        .filter {
          border: 1px solid var(--border);
          background: #fff;
          color: var(--text);
          border-radius: 999px;
          padding: 7px 11px;
          font-weight: 800;
          white-space: nowrap;
        }
        .filter.active {
          background: var(--primary);
          color: #fff;
          border-color: var(--primary);
        }
        .filter span {
          opacity: 0.8;
        }
        .order-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
          gap: 12px;
        }
        .order-card {
          background: #fff;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          padding: 14px;
          display: grid;
          gap: 11px;
        }
        .order-top,
        .order-total,
        .order-item {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
        }
        .status {
          border-radius: 999px;
          padding: 4px 9px;
          font-size: 12px;
          font-weight: 900;
        }
        .order-meta {
          display: grid;
          gap: 2px;
        }
        .order-items {
          display: grid;
          gap: 7px;
          padding: 9px;
          border-radius: 10px;
          background: #f8fafc;
        }
        .order-item span {
          min-width: 0;
        }
        .order-item b {
          white-space: nowrap;
          font-size: 13px;
        }
        .note {
          color: #92400e;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 10px;
          padding: 8px 10px;
          font-size: 13px;
        }
        .order-total strong {
          color: var(--primary);
          font-size: 18px;
        }
        .order-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .danger-btn {
          border: 1.5px solid var(--danger);
          color: var(--danger);
          background: #fff;
          border-radius: var(--radius);
          padding: 10px 14px;
          font-weight: 900;
        }
        .sale-id {
          color: var(--text-muted);
          font-size: 12px;
          margin-inline-start: auto;
        }
        .preview-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
          gap: 10px;
        }
        .preview-product {
          display: flex;
          gap: 10px;
          align-items: center;
          background: #fff;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 9px;
        }
        .preview-image {
          width: 46px;
          height: 46px;
          border-radius: 10px;
          background: #f1f5f9;
          overflow: hidden;
          display: grid;
          place-items: center;
          color: var(--primary);
          font-weight: 900;
          flex: 0 0 auto;
        }
        .preview-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .preview-product b,
        .preview-product span {
          display: block;
        }
        .empty {
          text-align: center;
          color: var(--text-muted);
          padding: 26px;
        }
        .toast {
          position: fixed;
          bottom: calc(var(--bottomnav-h) + 16px);
          left: 50%;
          transform: translateX(-50%);
          background: #0f172a;
          color: #fff;
          border-radius: 999px;
          padding: 10px 18px;
          font-weight: 900;
          z-index: 3000;
          box-shadow: var(--shadow);
        }
        @media (max-width: 860px) {
          .store-header,
          .stats-row {
            grid-template-columns: 1fr;
          }
          .link-box {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 14,
        boxShadow: 'var(--shadow)',
      }}
    >
      <b style={{ color: tone, display: 'block', fontSize: 28, lineHeight: 1 }}>{value}</b>
      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</span>
    </div>
  );
}
