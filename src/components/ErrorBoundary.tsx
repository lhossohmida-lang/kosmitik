'use client';

import { Component, type ReactNode } from 'react';

/**
 * حاجز أخطاء: يمنع الشاشة البيضاء عند خطأ في مكوّن.
 * حاسم: يزيل class الكاميرا العالق (barcode-scanner-active) الذي يُجمّد التطبيق.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch() {
    if (typeof document !== 'undefined') {
      document.body.classList.remove('barcode-scanner-active');
      document.body.style.overflow = '';
    }
  }

  reset = () => {
    if (typeof document !== 'undefined') document.body.classList.remove('barcode-scanner-active');
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '60dvh', display: 'grid', placeItems: 'center', padding: 16, textAlign: 'center' }}>
          <div className="card" style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 40 }}>⚠️</div>
            <h2 style={{ fontSize: 18, margin: '8px 0' }}>حدث خطأ غير متوقّع</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              يمكنك المتابعة — لم تُفقد أي بيانات.
            </p>
            <button className="btn" onClick={this.reset}>متابعة</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
