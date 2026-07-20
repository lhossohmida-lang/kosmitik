'use client';

import { useState, type ReactNode } from 'react';
import { checkPassword } from '@/lib/settings';

/** حماية صفحة بكلمة سر (التقارير، صندوق النقود). لا تحمي البيانات فعلياً — حاجز واجهة فقط. */
export default function PasswordGate({ title, children }: { title: string; children: ReactNode }) {
  const [ok, setOk] = useState(false);
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');

  if (ok) return <>{children}</>;

  return (
    <div style={{ minHeight: '50dvh', display: 'grid', placeItems: 'center' }}>
      <form
        className="card"
        style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}
        onSubmit={(e) => {
          e.preventDefault();
          if (checkPassword(pass)) setOk(true);
          else setError('كلمة السر غير صحيحة.');
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>{title}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>هذه الصفحة محميّة بكلمة سر.</p>
        <input
          className="input"
          type="password"
          autoFocus
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          dir="ltr"
          style={{ textAlign: 'center', marginBottom: 10 }}
          placeholder="كلمة السر"
        />
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <button className="btn" type="submit" style={{ width: '100%' }}>دخول</button>
      </form>
    </div>
  );
}
