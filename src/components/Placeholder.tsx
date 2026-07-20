/** بطاقة «قيد الإنشاء» مؤقّتة للصفحات التي ستُبنى في الخطوات القادمة. */
export default function Placeholder({
  title,
  icon,
  note,
}: {
  title: string;
  icon: string;
  note: string;
}) {
  return (
    <div className="card" style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>{icon}</div>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>{title}</h1>
      <p style={{ color: 'var(--text-muted)', lineHeight: 1.8 }}>{note}</p>
      <div
        style={{
          marginTop: 16,
          display: 'inline-block',
          padding: '4px 12px',
          borderRadius: 999,
          background: '#fef3c7',
          color: '#92400e',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        قيد الإنشاء — الخطوة القادمة
      </div>
    </div>
  );
}
