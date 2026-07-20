'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { startOfDay, endOfDay } from '@/lib/dates';
import type { Product, Sale, Customer, Supplier, Worker, WorkSession } from '@/lib/types';
import type { Purchase } from '@/lib/purchases';
import type { Expense } from '@/lib/expenses';
import { subscribeProducts } from '@/lib/products';
import { subscribeSales } from '@/lib/sales';
import { useCustomers } from '@/lib/customerStore';
import { useSuppliers } from '@/lib/supplierStore';
import { subscribePurchases } from '@/lib/purchases';
import { subscribeExpenses } from '@/lib/expenses';
import { subscribeWorkers, subscribeWorkSessions } from '@/lib/workers';
import { askAi, buildContext, aiConfigured, type AiMessage } from '@/lib/ai';

export default function AiPage() {
  const { storeId } = useAuth();
  const { t, lang } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [workSessions, setWorkSessions] = useState<WorkSession[]>([]);
  const customers = useCustomers(storeId);
  const suppliers = useSuppliers(storeId);

  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!storeId) return;
    const thirtyDaysAgo = startOfDay(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const nowEnd = endOfDay(Date.now());

    const u1 = subscribeProducts(storeId, setProducts);
    const u2 = subscribeSales(storeId, thirtyDaysAgo, nowEnd, setSales, () => {});
    const u3 = subscribePurchases(storeId, setPurchases, 100);
    const u4 = subscribeWorkers(storeId, setWorkers);
    const u5 = subscribeExpenses(storeId, thirtyDaysAgo, nowEnd, setExpenses);
    const u6 = subscribeWorkSessions(storeId, thirtyDaysAgo, nowEnd, setWorkSessions);
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); };
  }, [storeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, busy]);

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    const history = [...messages, { role: 'user', content: q } as AiMessage];
    setMessages(history);
    setBusy(true);
    try {
      const system: AiMessage = {
        role: 'system',
        content: buildContext(
          q,
          products,
          sales,
          customers,
          suppliers,
          purchases,
          workers,
          expenses,
          workSessions,
          lang,
        ),
      };
      const reply = await askAi([system, ...history]);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      const code = (e as Error).message;
      const msg =
        code === 'QUOTA'
          ? t('ai.error.quota')
          : code === 'NO_KEY'
          ? 'لم يُضبط مفتاح OpenRouter. أضف NEXT_PUBLIC_OPENROUTER_API_KEY في .env.local'
          : `${t('ai.error.generic')} (${code})`;
      setMessages((m) => [...m, { role: 'assistant', content: msg }]);
    } finally {
      setBusy(false);
    }
  }

  if (!aiConfigured) {
    return (
      <div className="card" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center', lineHeight: 1.9 }}>
        <div style={{ fontSize: 40 }}>🤖</div>
        <h2 style={{ fontSize: 18 }}>{t('ai.notConfiguredTitle')}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          أضف مفتاح OpenRouter في ملف <code>.env.local</code>:<br />
          <code style={{ background: 'var(--surface)', padding: '2px 6px', borderRadius: 4 }}>
            NEXT_PUBLIC_OPENROUTER_API_KEY=sk-or-v1-...
          </code>
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
          النموذج المستخدم: <strong>cohere/command-r-plus:free</strong><br />
          احصل على مفتاح مجاني من{' '}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">
            openrouter.ai/keys
          </a>
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 120px)' }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', display: 'grid', gap: 10, paddingBottom: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 30, lineHeight: 2 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
            <div>اسأل عن مبيعاتك، مخزونك، ديونك، عمالك، مصاريفك…</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>
              النموذج: <strong>cohere/command-r-plus:free</strong> عبر OpenRouter
            </div>
          </div>
        )}
        {messages.filter((m) => m.role !== 'system').map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === 'user' ? 'flex-start' : 'flex-end',
              maxWidth: '85%',
              background: m.role === 'user' ? 'var(--primary)' : 'var(--surface)',
              color: m.role === 'user' ? '#fff' : 'var(--text)',
              border: m.role === 'user' ? 'none' : '1px solid var(--border)',
              borderRadius: 14,
              padding: '10px 14px',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.7,
            }}
          >
            {m.content}
          </div>
        ))}
        {busy && <div style={{ alignSelf: 'flex-end', color: 'var(--text-muted)' }}>يكتب…</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="اكتب سؤالك…"
        />
        <button className="btn" onClick={send} disabled={busy}>إرسال</button>
      </div>
    </div>
  );
}
