'use client';

import { useEffect, useMemo, useState } from 'react';
import { branding, formatMoney } from '@/lib/branding';
import { createStoreOrder, subscribePublicProducts, type StoreOrderInput } from '@/lib/orders';
import { LANDING_VIDEOS, STOREFRONT } from '@/lib/storefront';
import type { PublicProduct, StoreOrderItem } from '@/lib/types';
import { useLanguage } from '@/context/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

interface CartLine {
  product: PublicProduct;
  qty: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function PublicShopPage() {
  const { t } = useLanguage();
  const [storeId, setStoreId] = useState('');
  const [linkReady, setLinkReady] = useState(false);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [toast, setToast] = useState('');
  const [sentOrder, setSentOrder] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStoreId((params.get('storeId') || params.get('store') || params.get('s') || '').trim());
    setLinkReady(true);
  }, []);

  useEffect(() => {
    if (!storeId) return;
    return subscribePublicProducts(
      storeId,
      (items) => {
        setProducts(items);
        setLoadError('');
      },
      () => setLoadError(t('shop.loadError')),
    );
  }, [storeId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!q) return true;
      return p.nameLower.includes(q) || p.category.toLowerCase().includes(q);
    });
  }, [products, search]);

  const subtotal = useMemo(() => round2(cart.reduce((sum, line) => sum + line.qty * line.product.unitSellPrice, 0)), [cart]);
  const total = subtotal;

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }

  function addToCart(product: PublicProduct) {
    if (product.stock <= 0) {
      flash(t('shop.unavailable'));
      return;
    }
    setSentOrder('');
    setCart((prev) => {
      const index = prev.findIndex((line) => line.product.id === product.id);
      if (index >= 0) {
        const copy = [...prev];
        const nextQty = Math.min(copy[index].qty + 1, product.stock);
        copy[index] = { ...copy[index], qty: nextQty };
        return copy;
      }
      return [...prev, { product, qty: 1 }];
    });
  }

  function setQty(productId: string, qty: number) {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.product.id !== productId) return line;
          return { ...line, qty: Math.max(0, Math.min(qty, line.product.stock)) };
        })
        .filter((line) => line.qty > 0),
    );
  }

  function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) return;
    if (cart.length === 0) return flash(t('shop.cartEmptyMsg'));
    if (!customerName.trim()) return flash(t('shop.writeName'));
    if (!phone.trim()) return flash(t('shop.writePhone'));

    const items: StoreOrderItem[] = cart.map((line) => ({
      productId: line.product.id,
      name: line.product.name,
      qty: line.qty,
      unitSellPrice: line.product.unitSellPrice,
      lineTotal: round2(line.qty * line.product.unitSellPrice),
      image: line.product.image ?? '',
    }));
    const input: StoreOrderInput = {
      customerName: customerName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      note: note.trim(),
      items,
      subtotal,
      total,
    };

    const id = createStoreOrder(storeId, input);
    setCart([]);
    setCustomerName('');
    setPhone('');
    setAddress('');
    setNote('');
    setSentOrder(id);
    flash(t('shop.orderSent'));
  }

  if (!linkReady) {
    return <main className="public-shop public-shop-empty">{t('shop.loading')}</main>;
  }

  if (!storeId) {
    return (
      <main className="public-shop public-shop-empty">
        <h1>{branding.storeName}</h1>
        <p>{t('shop.linkIncomplete')}</p>
      </main>
    );
  }

  return (
    <main className="public-shop">
      <div style={{ position: 'absolute', insetInlineEnd: 16, top: 16, zIndex: 5 }}>
        <LanguageSwitcher />
      </div>
      <section className="shop-hero">
        <div className="hero-copy">
          <div className="brand-mark">{branding.storeName}</div>
          <h1>{STOREFRONT.tagline}</h1>
          <p>{STOREFRONT.subtitle}</p>
        </div>
        <HeroVideo />
      </section>

      <section className="shop-body">
        <div className="catalog-pane">
          <div className="toolbar">
            <input
              className="shop-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('shop.searchPlaceholder')}
            />
          </div>

          {loadError ? (
            <div className="empty-state">{loadError}</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">{products.length === 0 ? t('shop.catalogEmpty') : t('shop.noResults')}</div>
          ) : (
            <div className="product-grid">
              {filtered.map((p) => {
                const unavailable = p.stock <= 0;
                return (
                  <article key={p.id} className="product-card">
                    <div className="product-image">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt={p.name} />
                      ) : (
                        <span>+</span>
                      )}
                    </div>
                    <div className="product-info">
                      <h2>{p.name}</h2>
                      {p.category && <div className="category">{p.category}</div>}
                      <div className="product-foot">
                        <strong>{formatMoney(p.unitSellPrice)}</strong>
                        <button disabled={unavailable} onClick={() => addToCart(p)}>
                          {unavailable ? t('shop.unavailableBtn') : t('shop.add')}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="cart-pane">
          <div className="cart-head">
            <b>{t('shop.cart')}</b>
            <span>{cart.length}</span>
          </div>

          <div className="cart-lines">
            {cart.length === 0 ? (
              <div className="cart-empty">{sentOrder ? t('shop.orderReceived', { id: sentOrder.slice(0, 6) }) : t('shop.pickFromCatalog')}</div>
            ) : (
              cart.map((line) => (
                <div key={line.product.id} className="cart-line">
                  <div>
                    <b>{line.product.name}</b>
                    <span>{formatMoney(line.product.unitSellPrice)}</span>
                  </div>
                  <div className="qty">
                    <button onClick={() => setQty(line.product.id, line.qty - 1)}>-</button>
                    <input
                      type="number"
                      min={1}
                      max={line.product.stock}
                      value={line.qty}
                      onChange={(e) => setQty(line.product.id, Number(e.target.value))}
                    />
                    <button onClick={() => setQty(line.product.id, line.qty + 1)}>+</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={submitOrder} className="order-form">
            <div className="total-row">
              <span>{t('shop.total')}</span>
              <strong>{formatMoney(total)}</strong>
            </div>
            <input className="shop-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={t('shop.namePlaceholder')} />
            <input className="shop-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('shop.phonePlaceholder')} inputMode="tel" />
            <input className="shop-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('shop.addressPlaceholder')} />
            <textarea className="shop-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('shop.notePlaceholder')} rows={3} />
            <button className="send-btn" disabled={cart.length === 0}>
              {t('shop.sendOrder')}
            </button>
          </form>
        </aside>
      </section>

      {toast && <div className="toast">{toast}</div>}

      <style jsx global>{`
        .public-shop {
          position: relative;
          min-height: 100dvh;
          background: #fff7fb;
          color: #2a1020;
          padding: 18px;
        }
        .public-shop-empty {
          display: grid;
          place-items: center;
          text-align: center;
        }
        .shop-hero {
          max-width: 1180px;
          margin: 0 auto 18px;
          min-height: 330px;
          border-radius: 22px;
          overflow: hidden;
          background: linear-gradient(135deg, #5f1238 0%, #be185d 48%, #f8a8cf 100%);
          color: #fff;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(240px, 360px);
          align-items: stretch;
        }
        .hero-copy {
          padding: clamp(26px, 5vw, 52px);
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 10px;
        }
        .brand-mark {
          font-weight: 900;
          font-size: 18px;
          letter-spacing: 0;
        }
        h1 {
          font-size: clamp(32px, 5vw, 58px);
          line-height: 1.04;
          max-width: 660px;
        }
        .hero-copy p {
          font-size: 17px;
          max-width: 620px;
          opacity: 0.92;
        }
        .hero-video {
          min-height: 330px;
          background: rgba(255, 255, 255, 0.16);
        }
        .hero-video video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .shop-body {
          max-width: 1180px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: 16px;
          align-items: start;
        }
        .catalog-pane,
        .cart-pane {
          background: #fff;
          border: 1px solid #f3c8dc;
          border-radius: 16px;
          box-shadow: 0 12px 30px rgba(157, 23, 77, 0.08);
        }
        .catalog-pane {
          padding: 14px;
        }
        .toolbar {
          display: grid;
          gap: 10px;
          margin-bottom: 14px;
        }
        .shop-input {
          width: 100%;
          border: 1.5px solid #f0b8d2;
          background: #fff;
          color: #2a1020;
          border-radius: 12px;
          padding: 11px 12px;
          outline: none;
        }
        .shop-input:focus {
          border-color: #be185d;
        }
        .chips {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 2px;
        }
        .chip {
          border: 1px solid #f0b8d2;
          background: #fff;
          color: #7c1d4b;
          border-radius: 999px;
          padding: 7px 13px;
          font-weight: 800;
          white-space: nowrap;
        }
        .chip.active {
          background: #be185d;
          color: #fff;
          border-color: #be185d;
        }
        .product-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
          gap: 12px;
        }
        .product-card {
          border: 1px solid #f5d5e4;
          border-radius: 14px;
          overflow: hidden;
          background: #fff;
          display: flex;
          flex-direction: column;
        }
        .product-image {
          aspect-ratio: 1;
          background: #fdf2f8;
          display: grid;
          place-items: center;
          overflow: hidden;
          color: #be185d;
          font-size: 40px;
          font-weight: 300;
        }
        .product-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .product-info {
          padding: 10px;
          display: grid;
          gap: 6px;
          flex: 1;
        }
        .product-info h2 {
          font-size: 15px;
          line-height: 1.35;
        }
        .category {
          color: #9f5f7b;
          font-size: 12px;
        }
        .product-foot {
          margin-top: auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .product-foot strong {
          color: #be185d;
          font-size: 14px;
        }
        .product-foot button,
        .send-btn {
          border: none;
          border-radius: 10px;
          background: #be185d;
          color: #fff;
          font-weight: 900;
          padding: 8px 11px;
        }
        .product-foot button:disabled,
        .send-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .cart-pane {
          position: sticky;
          top: 16px;
          overflow: hidden;
        }
        .cart-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px;
          border-bottom: 1px solid #f5d5e4;
        }
        .cart-head span {
          width: 28px;
          height: 28px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #fdf2f8;
          color: #be185d;
          font-weight: 900;
        }
        .cart-lines {
          max-height: 260px;
          overflow-y: auto;
        }
        .cart-empty,
        .empty-state {
          padding: 34px 16px;
          text-align: center;
          color: #9f5f7b;
        }
        .cart-line {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid #f8e3ed;
        }
        .cart-line b,
        .cart-line span {
          display: block;
        }
        .cart-line span {
          color: #9f5f7b;
          font-size: 12px;
        }
        .qty {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .qty button {
          width: 28px;
          height: 28px;
          border: 1px solid #f0b8d2;
          border-radius: 8px;
          background: #fff;
          color: #be185d;
          font-weight: 900;
        }
        .qty input {
          width: 46px;
          height: 28px;
          border: 1px solid #f0b8d2;
          border-radius: 8px;
          text-align: center;
        }
        .order-form {
          display: grid;
          gap: 9px;
          padding: 14px;
          border-top: 1px solid #f5d5e4;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 18px;
          font-weight: 900;
        }
        .total-row strong {
          color: #be185d;
        }
        .send-btn {
          min-height: 44px;
          font-size: 16px;
        }
        .toast {
          position: fixed;
          left: 50%;
          bottom: 18px;
          transform: translateX(-50%);
          background: #2a1020;
          color: #fff;
          border-radius: 999px;
          padding: 10px 18px;
          font-weight: 900;
          z-index: 20;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.18);
        }
        @media (max-width: 860px) {
          .public-shop {
            padding: 10px;
          }
          .shop-hero,
          .shop-body {
            grid-template-columns: 1fr;
          }
          .hero-video {
            min-height: 240px;
          }
          .cart-pane {
            position: static;
          }
        }
      `}</style>
    </main>
  );
}

function HeroVideo() {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());

  if (LANDING_VIDEOS.length === 0 || failed.size >= LANDING_VIDEOS.length) return null;

  function next() {
    setIndex((current) => {
      for (let step = 1; step <= LANDING_VIDEOS.length; step++) {
        const candidate = (current + step) % LANDING_VIDEOS.length;
        if (!failed.has(candidate)) return candidate;
      }
      return current;
    });
  }

  return (
    <div className="hero-video">
      <video
        key={index}
        src={LANDING_VIDEOS[index]}
        autoPlay
        muted
        playsInline
        onEnded={next}
        onError={() => {
          setFailed((current) => new Set(current).add(index));
          next();
        }}
      />
    </div>
  );
}
