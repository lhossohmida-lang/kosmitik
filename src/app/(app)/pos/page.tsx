'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { branding, formatMoney } from '@/lib/branding';
import type { Product, Customer, PaymentMode, SaleItem } from '@/lib/types';
import { useProducts } from '@/lib/productStore';
import { saveProduct, type ProductInput } from '@/lib/products';
import BarcodeLinkDialog from '@/components/BarcodeLinkDialog';
import { useCustomers } from '@/lib/customerStore';
import { recordSale, type SaleInput } from '@/lib/sales';
import { addStock } from '@/lib/stock';
import { printReceipt } from '@/lib/print';
import { useUsbScanner } from '@/hooks/useUsbScanner';
import { isCapacitor } from '@/lib/env';
import { nativeScanContinuous } from '@/lib/scanner';
import { beep, vibrate } from '@/lib/sound';
import CameraScanner from '@/components/CameraScanner';
import CustomerPicker from '@/components/pos/CustomerPicker';
import AddStockDialog from '@/components/pos/AddStockDialog';
import Modal from '@/components/Modal';
import ProductForm from '@/components/ProductForm';

interface CartLine {
  product: Product;
  qty: number;
  unitPrice: number;
}

interface HeldCart {
  id: string;
  name: string;
  cart: CartLine[];
  discount: number;
  mode: PaymentMode;
  customer: Customer | null;
  createdAt: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function PosPage() {
  const { storeId, permissions } = useAuth();
  const { t } = useLanguage();
  const { products } = useProducts(storeId); // مخزن مشترك (بلا إعادة تحميل)
  const customers = useCustomers(storeId);

  const [search, setSearch] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [mode, setMode] = useState<PaymentMode>('cash');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isReturnMode, setIsReturnMode] = useState(false);

  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [heldCartsOpen, setHeldCartsOpen] = useState(false);
  const [holdNameInput, setHoldNameInput] = useState('');
  const [holdPromptOpen, setHoldPromptOpen] = useState(false);

  const [scanOpen, setScanOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stockTarget, setStockTarget] = useState<Product | null>(null);
  const [linkBarcode, setLinkBarcode] = useState<string | null>(null);
  // ذاكرة مؤقتة للباركودات المربوطة حديثاً (قبل أن تُحدّث Firebase المنتجات).
  const linkedBarcodesRef = useRef<Map<string, Product>>(new Map());
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [toast, setToast] = useState('');

  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<(HTMLInputElement | null)[]>([]);
  const discountRefs = useRef<(HTMLInputElement | null)[]>([]);
  const lineTotalRefs = useRef<(HTMLInputElement | null)[]>([]);
  const totalRef = useRef<HTMLInputElement>(null);
  const totalEditingRef = useRef(false);
  const [totalInput, setTotalInput] = useState('');

  // مراجع حديثة لتفادي الإغلاقات القديمة داخل مستمعي لوحة المفاتيح.
  const productsRef = useRef(products);
  productsRef.current = products;

  // ---------- الاشتراكات اللحظية ----------
  useEffect(() => {
    if (!storeId) return;
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    try {
      const saved = localStorage.getItem(`kosmitik_held_carts_${storeId}`);
      if (saved) setHeldCarts(JSON.parse(saved));
    } catch (e) {
      console.error(e);
    }
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    localStorage.setItem(`kosmitik_held_carts_${storeId}`, JSON.stringify(heldCarts));
  }, [heldCarts, storeId]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2500);
  }, []);

  const focusSearch = useCallback(() => {
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  // ---------- السلّة ----------
  const addToCart = useCallback(
    (product: Product, qty = 1) => {
      setCart((prev) => {
        const addedQty = isReturnMode ? -Math.abs(qty) : Math.abs(qty);
        const i = prev.findIndex((l) => l.product.id === product.id);
        if (i >= 0) {
          const copy = [...prev];
          copy[i] = { ...copy[i], qty: copy[i].qty + addedQty };
          return copy.filter(l => l.qty !== 0);
        }
        return [...prev, { product, qty: addedQty, unitPrice: product.unitSellPrice }];
      });
      setSearch('');
      setHighlight(0);
      focusSearch();
    },
    [focusSearch, isReturnMode],
  );

  const addByBarcode = useCallback(
    (code: string) => {
      // تحقق أولاً من الذاكرة المحلية (قبل أن تُحدّث Firebase) ثم من قائمة المنتجات.
      const localP = linkedBarcodesRef.current.get(code);
      const p = localP || productsRef.current.find((pr) => pr.barcodes.includes(code));
      if (p) {
        addToCart(p);
        beep(1);
        vibrate();
      } else {
        beep(2);
        vibrate();
        setScanOpen(false); // إغلاق الكاميرا لتجنب تداخل الشاشات
        setLinkBarcode(code); // باركود غير موجود → بطاقة ربط بمنتج
      }
      setSearch('');
    },
    [addToCart],
  );

  // قارئ USB (يُعطَّل أثناء فتح الكاميرا لتفادي التداخل).
  useUsbScanner({ onScan: addByBarcode, enabled: !scanOpen });

  // مرجع لإلغاء حلقة المسح المتواصل عند إغلاق POS.
  const scanAbortRef = useRef<AbortController | null>(null);

  // فتح الماسح:
  //   APK  → ML Kit (حلقة متواصلة: اقرأ باركود، أضف للسلة، افتح ماسح مجدداً، حتى يضغط المستخدم إلغاء).
  //   PWA/حاسوب → CameraScanner مفتوح بوضع continuous=true (يبقى مفتوحاً حتى يضغط المستخدم إغلاق).
  async function openScanner() {
    if (isCapacitor()) {
      try {
        const ctrl = new AbortController();
        scanAbortRef.current = ctrl;
        await nativeScanContinuous(addByBarcode, ctrl.signal);
        scanAbortRef.current = null;
        return;
      } catch {
        /* ML Kit غير متاح → بديل الويب */
      }
    }
    setScanOpen(true);
  }

  const handleCellKeyDown = (e: React.KeyboardEvent, r: number, c: number) => {
    let nextR = r;
    let nextC = c;
    if (e.key === 'ArrowUp') nextR = r - 1;
    else if (e.key === 'ArrowDown') nextR = r + 1;
    else if (e.key === 'ArrowLeft') nextC = c + 1; // Left visually (towards total)
    else if (e.key === 'ArrowRight') nextC = c - 1; // Right visually (towards qty)
    else return;

    const target = e.currentTarget as HTMLInputElement;
    if (e.key === 'ArrowLeft' && target.selectionStart !== null && target.selectionStart > 0) return;
    if (e.key === 'ArrowRight' && target.selectionEnd !== null && target.selectionEnd < target.value.length) return;

    if (nextR >= 0 && nextR < cart.length) {
      if (nextC < 0) nextC = 0;
      if (nextC > 2) nextC = 2;
      
      e.preventDefault();
      if (nextC === 0) qtyRefs.current[nextR]?.focus();
      else if (nextC === 1) discountRefs.current[nextR]?.focus();
      else if (nextC === 2) lineTotalRefs.current[nextR]?.focus();
      
      setTimeout(() => {
        const nextInput = nextC === 0 ? qtyRefs.current[nextR] : nextC === 1 ? discountRefs.current[nextR] : lineTotalRefs.current[nextR];
        if (nextInput) nextInput.select();
      }, 10);
    }
  };

  const setLineQty = (index: number, qty: number) =>
    setCart((prev) => prev.map((l, i) => (i === index ? { ...l, qty } : l)));

  const setLineTotal = (index: number, total: number) =>
    setCart((prev) =>
      prev.map((l, i) => (i === index && l.qty !== 0 ? { ...l, unitPrice: Math.abs(round2(total / l.qty)) } : l)),
    );

  const removeLine = (index: number) => setCart((prev) => prev.filter((_, i) => i !== index));
  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setCustomer(null);
    setMode('cash');
  };

  const handleHoldCart = () => {
    const name = holdNameInput.trim();
    if (!name) return;
    const newCart: HeldCart = {
      id: Date.now().toString(),
      name,
      cart,
      discount,
      mode,
      customer,
      createdAt: Date.now()
    };
    setHeldCarts(prev => [...prev, newCart]);
    clearCart();
    setHoldPromptOpen(false);
    setHoldNameInput('');
    showToast('تم حفظ المعاملة بنجاح');
    focusSearch();
  };

  const loadHeldCart = (held: HeldCart) => {
    setCart(held.cart);
    setDiscount(held.discount);
    setMode(held.mode);
    setCustomer(held.customer);
    setHeldCarts(prev => prev.filter(c => c.id !== held.id));
    setHeldCartsOpen(false);
    showToast('تم استرجاع المعاملة');
    focusSearch();
  };

  // ---------- الحسابات ----------
  const subtotal = useMemo(() => round2(cart.reduce((s, l) => s + l.qty * l.unitPrice, 0)), [cart]);
  const effectiveDiscount = Math.min(discount, subtotal);
  const total = round2(subtotal - effectiveDiscount);
  
  const totalCost = useMemo(() => round2(cart.reduce((s, l) => s + l.qty * (l.product.unitPurchasePrice || 0), 0)), [cart]);
  const totalProfit = round2(total - totalCost);

  // خانة الإجمالي تعكس السعر الحالي دائماً، إلا أثناء تعديلها عبر F12 (تُصبح فارغة للكتابة).
  useEffect(() => {
    if (!totalEditingRef.current) setTotalInput(String(total));
  }, [total]);

  // شاشة الزبون (Electron، الشاشة الثانية): المجموع أثناء البيع، «deku» عند الخمول.
  useEffect(() => {
    const api = (window as unknown as { electronAPI?: { customerDisplay?: (p: { idle: boolean; total?: string }) => void } }).electronAPI;
    if (!api?.customerDisplay) return;
    if (cart.length === 0) api.customerDisplay({ idle: true });
    else api.customerDisplay({ idle: false, total: total.toFixed(2) });
  }, [cart.length, total]);
  useEffect(() => {
    // مغادرة نقطة البيع → خمول.
    return () => {
      const api = (window as unknown as { electronAPI?: { customerDisplay?: (p: { idle: boolean }) => void } }).electronAPI;
      api?.customerDisplay?.({ idle: true });
    };
  }, []);

  function focusTotalForEdit() {
    totalEditingRef.current = true;
    setTotalInput('');
    totalRef.current?.focus();
  }

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.nameLower.includes(q) || p.barcodes.some((b) => b.includes(q)))
      .slice(0, 8);
  }, [products, search]);

  // اختصارات نقطة البيع: فقط المنتجات التي فعّل لها المالك النجمة في المخزون.
  const quickProducts = useMemo(() => products.filter((p) => p.quickAccess), [products]);
  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products],
  );

  function handleEditProductSubmit(input: ProductInput, id?: string) {
    if (!storeId) return;
    saveProduct(storeId, input, id);
    setEditingProduct(null);
  }

  // ---------- تأكيد البيع ----------
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const customerRef = useRef(customer);
  customerRef.current = customer;
  const discountRef = useRef(effectiveDiscount);
  discountRef.current = effectiveDiscount;

  const confirmSale = useCallback(
    (doPrint: boolean) => {
      if (!storeId) return;
      if (cartRef.current.length === 0) return showToast(t('pos.toast.cartEmpty'));
      if (modeRef.current === 'credit' && !customerRef.current) {
        setPickerOpen(true);
        return showToast(t('pos.toast.pickCredit'));
      }

      const items: SaleItem[] = cartRef.current.map((l) => ({
        productId: l.product.id,
        name: l.product.name,
        qty: l.qty,
        unitSellPrice: l.unitPrice,
        unitPurchasePrice: l.product.unitPurchasePrice,
        lineTotal: round2(l.qty * l.unitPrice),
      }));
      const sub = round2(items.reduce((s, i) => s + i.lineTotal, 0));
      const disc = Math.min(discountRef.current, sub);
      const grand = round2(sub - disc);

      const input: SaleInput = {
        items,
        subtotal: sub,
        discount: disc,
        total: grand,
        payment: modeRef.current,
        customerId: customerRef.current?.id ?? null,
        customerName: customerRef.current?.name ?? null,
      };

      const id = recordSale(storeId, input);
      if (doPrint) printReceipt({ id, createdAt: Date.now(), status: 'active', ...input });

      clearCart();
      setSearch('');
      showToast(doPrint ? t('pos.toast.soldPrinted') : t('pos.toast.sold'));
      focusSearch();
    },
    [storeId, showToast, focusSearch, t],
  );

  // ---------- اختصارات لوحة المفاتيح العامة ----------
  const confirmRef = useRef(confirmSale);
  confirmRef.current = confirmSale;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case 'F1':
          e.preventDefault();
          // نافذة بيع ثانية (سلوك Electron الكامل في الخطوة 10).
          window.open(window.location.href, '_blank', 'width=1100,height=800');
          break;
        case 'F2':
          e.preventDefault();
          setMode('credit');
          setPickerOpen(true);
          break;
        case 'F3':
          e.preventDefault();
          confirmRef.current(true);
          break;
        case 'F12':
          e.preventDefault();
          focusTotalForEdit();
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    focusSearch();
  }, [focusSearch]);

  // ---------- تنقّل خانة البحث ----------
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
      else if (search === '' && cart.length > 0) qtyRefs.current[0]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length > 0) {
        addToCart(suggestions[Math.min(highlight, suggestions.length - 1)]);
      } else if (search.trim()) {
        addByBarcode(search.trim());
      }
    } else if (e.key === 'Delete' && search === '') {
      e.preventDefault();
      if (cart.length > 0) clearCart();
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(300px, 420px)', gap: 16, alignItems: 'start' }} className="pos-grid">
      {/* ======= العمود الأيمن: البحث + الاقتراحات + الاختصارات ======= */}
      <div>
        <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
          <input
            ref={searchRef}
            className="input"
            style={{ flex: 1, fontSize: 17, padding: 14 }}
            placeholder={t('pos.searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onSearchKeyDown}
          />
          <button className="btn" onClick={openScanner} title={t('pos.scanTitle')} style={{ padding: '0 16px', fontSize: 20 }}>
            📷
          </button>
          <button 
            className="btn"
            onClick={() => setIsReturnMode(!isReturnMode)}
            title={t('pos.returnMode')}
            style={{ 
              padding: '0 16px', 
              fontSize: 18, 
              background: isReturnMode ? 'var(--danger)' : undefined,
              color: isReturnMode ? '#fff' : 'inherit',
              borderColor: isReturnMode ? 'var(--danger)' : 'var(--border)'
            }}
          >
            ↩️
          </button>

          {suggestions.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                insetInline: 0,
                background: 'var(--surface-strong)',
                WebkitBackdropFilter: 'var(--glass-blur)',
                backdropFilter: 'var(--glass-blur)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 50,
                overflow: 'hidden',
              }}
            >
              {suggestions.map((p, i) => (
                <div
                  key={p.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addToCart(p);
                  }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    background: i === highlight ? 'rgba(15,118,110,0.1)' : '#fff',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {p.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <span>
                      <b>{p.name}</b>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> · {p.stock} {t('pos.unit')}</span>
                    </span>
                  </span>
                  <span style={{ fontWeight: 700 }}>{formatMoney(p.unitSellPrice)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* أزرار الاختصار السريعة — فقط ما فعّلت له النجمة في المخزون */}
        <div style={{ marginTop: 16 }}>
          {quickProducts.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t('pos.noShortcuts')}
            </div>
          ) : (
            <>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{t('pos.quickButtons')}</div>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))' }}>
              {quickProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="no-select"
                  style={{
                    padding: 12,
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--glass-border)',
                    background: 'var(--surface)',
                    WebkitBackdropFilter: 'var(--glass-blur)',
                    backdropFilter: 'var(--glass-blur)',
                    boxShadow: 'var(--shadow)',
                    textAlign: 'center',
                    minHeight: 78,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {p.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }} />
                  )}
                  <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ color: 'var(--primary)', fontWeight: 800 }}>
                    {formatMoney(p.unitSellPrice)}
                  </div>
                </button>
              ))}
            </div>
            </>
          )}
        </div>
      </div>

      {/* ======= العمود الأيسر: الدفع (فوق) + السلّة ======= */}
      <div className="cart-col card" style={{ position: 'sticky', top: 72, padding: 0, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 96px)' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b>{t('pos.cart')} ({cart.length})</b>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={() => setHeldCartsOpen(true)} style={{ border: 'none', background: 'none', color: 'var(--primary)', fontSize: 13, fontWeight: 700, position: 'relative' }}>
              معاملات الانتظار
              {heldCarts.length > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -12, background: 'var(--danger)', color: '#fff', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>{heldCarts.length}</span>
              )}
            </button>
            {cart.length > 0 && (
              <>
                <button onClick={() => setHoldPromptOpen(true)} style={{ border: 'none', background: 'none', color: '#eab308', fontSize: 13, fontWeight: 700 }}>
                  انتظار
                </button>
                <button onClick={clearCart} style={{ border: 'none', background: 'none', color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>
                  {t('pos.empty')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* منطقة الدفع — فوق المنتجات ليبقى الإجمالي والتأكيد ظاهرَين دائماً */}
        <div style={{ borderBottom: '1px solid var(--border)', padding: 12, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setMode('cash'); setCustomer(null); }} className="no-select" style={modeBtn(mode === 'cash')}>
              {t('pos.cash')}
            </button>
            <button onClick={() => { setMode('credit'); setPickerOpen(true); }} className="no-select" style={modeBtn(mode === 'credit')}>
              {t('pos.credit')} {customer ? `· ${customer.name}` : ''}
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('pos.discount')}</span>
            <input
              type="number"
              min={0}
              value={discount || ''}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
              placeholder="0"
              style={{ width: 100, textAlign: 'left', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 22, fontWeight: 800 }}>
            <span>{t('pos.total')}</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <input
                ref={totalRef}
                type="number"
                value={totalInput}
                onChange={(e) => {
                  setTotalInput(e.target.value);
                  if (e.target.value.trim() === '') return; // فارغ → يبقى السعر الأصلي عند التأكيد
                  const val = Number(e.target.value);
                  if (Number.isFinite(val)) setDiscount(Math.max(0, round2(subtotal - val)));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    totalEditingRef.current = false;
                    confirmSale(false);
                    setTotalInput(String(total));
                  }
                }}
                onBlur={() => {
                  totalEditingRef.current = false;
                  setTotalInput(String(total));
                }}
                title={t('pos.editTotal')}
                style={{ width: 130, textAlign: 'left', fontSize: 22, fontWeight: 800, color: 'var(--primary)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '2px 8px', background: '#fff' }}
              />
              {(permissions.includes('*') || permissions.includes('/products')) && totalProfit !== 0 && (
                <span style={{ fontSize: 13, color: totalProfit > 0 ? 'var(--success)' : 'var(--danger)', marginTop: 4 }}>
                  الفائدة الكلية: {formatMoney(totalProfit)}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => confirmSale(true)}>
              {t('pos.confirmPrint')} <small style={{ opacity: 0.8 }}>(F3)</small>
            </button>
            <button
              className="btn-outline"
              style={{ flex: 1, background: 'transparent', border: '1.5px solid var(--primary)', color: 'var(--primary)' }}
              onClick={focusTotalForEdit}
            >
              {t('pos.confirmOnly')} <small style={{ opacity: 0.8 }}>(F12)</small>
            </button>
          </div>
        </div>

        <div className="cart-items" style={{ flex: 1, overflowY: 'auto', padding: cart.length ? 8 : 0, minHeight: 90 }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>{t('pos.cartEmpty')}</div>
          ) : (
            cart.map((l, i) => {
              const insufficient = l.product.stock < l.qty;
              const isBelowCost = l.unitPrice < (l.product.unitPurchasePrice || 0);
              const itemColor = l.qty < 0 ? 'var(--danger)' : isBelowCost ? 'var(--danger)' : 'inherit';
              
              return (
                <div key={l.product.id} style={{ padding: 8, borderBottom: '1px solid var(--border)', background: l.qty < 0 ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <b style={{ fontSize: 14, color: itemColor }}>{l.product.name}</b>
                      {(permissions.includes('*') || permissions.includes('/products')) && (
                        <div style={{ fontSize: 11, color: 'var(--success)' }}>
                          الفائدة: {formatMoney((l.unitPrice - (l.product.unitPurchasePrice || 0)) * Math.abs(l.qty))}
                        </div>
                      )}
                    </div>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <button
                        onClick={() => setEditingProduct(l.product)}
                        title={t('pos.editProduct')}
                        style={{ border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 14 }}
                      >
                        ✏️
                      </button>
                      <button onClick={() => removeLine(i)} style={{ border: 'none', background: 'none', color: 'var(--danger)', fontWeight: 800 }}>
                        ✕
                      </button>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button className="qty-btn" onClick={() => setLineQty(i, l.qty - 1)}>−</button>
                      <input
                        ref={(el) => {
                          qtyRefs.current[i] = el;
                        }}
                        type="number"
                        value={l.qty}
                        onChange={(e) => setLineQty(i, Number(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === 'Delete') {
                            e.preventDefault();
                            removeLine(i);
                            focusSearch();
                          } else if (e.key === 'Enter') {
                            focusSearch();
                          } else {
                            handleCellKeyDown(e, i, 0);
                          }
                        }}
                        style={{ width: 48, textAlign: 'center', border: '1px solid var(--border)', borderRadius: 8, padding: '4px' }}
                      />
                      <button className="qty-btn" onClick={() => setLineQty(i, l.qty + 1)}>+</button>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>×</span>
                    <span style={{ fontSize: 13, color: itemColor }}>{formatMoney(l.unitPrice)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginInlineStart: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>خصم:</span>
                      <input
                        ref={(el) => {
                          discountRefs.current[i] = el;
                        }}
                        type="number"
                        min={0}
                        value={round2(Math.max(0, l.product.unitSellPrice - l.unitPrice)) || ''}
                        onChange={(e) => {
                          const d = Math.max(0, Number(e.target.value));
                          const newUnitPrice = Math.max(0, l.product.unitSellPrice - d);
                          setCart((prev) => prev.map((item, idx) => (idx === i ? { ...item, unitPrice: newUnitPrice } : item)));
                        }}
                        onKeyDown={(e) => handleCellKeyDown(e, i, 1)}
                        placeholder="0"
                        style={{ width: 50, textAlign: 'center', border: '1px solid var(--border)', borderRadius: 6, padding: '2px', fontSize: 12 }}
                      />
                    </div>
                    <input
                      ref={(el) => {
                        lineTotalRefs.current[i] = el;
                      }}
                      type="number"
                      value={round2(l.qty * l.unitPrice)}
                      onChange={(e) => setLineTotal(i, Number(e.target.value))}
                      onKeyDown={(e) => handleCellKeyDown(e, i, 2)}
                      style={{ marginInlineStart: 'auto', width: 90, textAlign: 'left', fontWeight: 700, border: '1px solid var(--border)', borderRadius: 8, padding: '4px 6px', color: itemColor }}
                      title={t('pos.editTotal')}
                    />
                  </div>
                  {insufficient && (
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--danger)', display: 'flex', gap: 8, alignItems: 'center' }}>
                      {t('pos.insufficientStock', { n: l.product.stock })}
                      <button
                        onClick={() => setStockTarget(l.product)}
                        style={{ border: '1px solid var(--danger)', background: '#fff', color: 'var(--danger)', borderRadius: 6, fontSize: 11, fontWeight: 700, padding: '1px 6px' }}
                      >
                        {t('pos.addQty')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(var(--bottomnav-h) + 16px)',
            insetInline: 0,
            display: 'flex',
            justifyContent: 'center',
            zIndex: 3000,
            pointerEvents: 'none',
          }}
        >
          <div style={{ background: '#0f172a', color: '#fff', padding: '10px 18px', borderRadius: 999, fontWeight: 700, boxShadow: 'var(--shadow)' }}>
            {toast}
          </div>
        </div>
      )}

      {/* continuous=true: يبقى الماسح مفتوحاً لمسح عدة باركودات دفعة واحدة */}
      <CameraScanner open={scanOpen} onScan={addByBarcode} onClose={() => setScanOpen(false)} continuous />
      <CustomerPicker
        open={pickerOpen}
        customers={customers}
        onSelect={(c) => {
          setCustomer(c);
          setMode('credit');
          setPickerOpen(false);
          focusSearch();
        }}
        onClose={() => setPickerOpen(false)}
      />
      <AddStockDialog
        open={!!stockTarget}
        product={stockTarget}
        onConfirm={(qty) => {
          if (storeId && stockTarget) addStock(storeId, stockTarget.id, qty);
          setStockTarget(null);
          showToast(t('pos.toast.stockAdded'));
        }}
        onClose={() => setStockTarget(null)}
      />

      {/* تعديل منتج من السلّة مباشرةً */}
      <Modal open={!!editingProduct} onClose={() => setEditingProduct(null)} title={t('pos.editProduct')} width={640}>
        {editingProduct && (
          <ProductForm
            editing={editingProduct}
            products={products}
            categories={categories}
            onSubmit={handleEditProductSubmit}
            onClose={() => setEditingProduct(null)}
          />
        )}
      </Modal>

      {/* باركود غير موجود → بطاقة تعديل كاملة لإضافة الباركود لمنتج موجود */}
      {linkBarcode && storeId && (
        <BarcodeLinkDialog
          open
          barcode={linkBarcode}
          storeId={storeId}
          products={products}
          onDone={(p) => {
            // احفظ الباركود محلياً فوراً لتفادي ظهور نافذة الربط مجدداً قبل تحديث Firebase.
            if (linkBarcode) linkedBarcodesRef.current.set(linkBarcode, p);
            addToCart(p);
            showToast(t('pos.toast.barcodeLinked', { name: p.name }));
            setLinkBarcode(null);
          }}
          onClose={() => setLinkBarcode(null)}
        />
      )}

      {/* نوافذ معاملات الانتظار */}
      <Modal open={holdPromptOpen} onClose={() => setHoldPromptOpen(false)} title="حفظ في الانتظار" width={400}>
        <div style={{ padding: 16 }}>
          <p style={{ marginBottom: 12, fontSize: 14 }}>يرجى إدخال اسم لهذه المعاملة (مثلاً اسم الزبون) للرجوع إليها لاحقاً:</p>
          <input
            autoFocus
            className="input"
            value={holdNameInput}
            onChange={(e) => setHoldNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleHoldCart(); }}
            placeholder="اسم الزبون أو المعاملة"
            style={{ width: '100%', marginBottom: 16 }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-outline" onClick={() => setHoldPromptOpen(false)}>إلغاء</button>
            <button className="btn" onClick={handleHoldCart}>حفظ المعاملة</button>
          </div>
        </div>
      </Modal>

      <Modal open={heldCartsOpen} onClose={() => setHeldCartsOpen(false)} title="معاملات في الانتظار" width={500}>
        <div style={{ padding: 16 }}>
          {heldCarts.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>لا توجد معاملات في الانتظار</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {heldCarts.map((hc) => (
                <div key={hc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{hc.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{hc.cart.length} أصناف · {new Date(hc.createdAt).toLocaleTimeString()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-outline" onClick={() => setHeldCarts(prev => prev.filter(c => c.id !== hc.id))} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>حذف</button>
                    <button className="btn" onClick={() => loadHeldCart(hc)}>استرجاع</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <style jsx>{`
        .qty-btn {
          width: 28px;
          height: 28px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
          font-size: 18px;
          font-weight: 700;
          line-height: 1;
        }
        @media (max-width: 860px) {
          .pos-grid {
            grid-template-columns: 1fr !important;
          }
          /* على الهاتف: السلّة غير ملتصقة، والمنتجات تُمرَّر داخلها فيصل المستخدم للأسفل */
          .cart-col {
            position: static !important;
            max-height: none !important;
          }
          .cart-items {
            max-height: 46vh;
          }
        }
      `}</style>
    </div>
  );
}

function modeBtn(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: 10,
    borderRadius: 'var(--radius)',
    border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
    background: active ? 'var(--primary)' : '#fff',
    color: active ? '#fff' : 'var(--text)',
    fontWeight: 700,
    fontSize: 14,
  };
}
