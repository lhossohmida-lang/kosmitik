/** أدوات تواريخ مشتركة (بداية/نهاية اليوم، نطاقات، تنسيق). */

export function startOfDay(d: Date | number): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function endOfDay(d: Date | number): number {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

/** yyyy-mm-dd لحقول <input type="date"> بالتوقيت المحلي. */
export function toDateInput(d: Date | number): string {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateInput(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('ar-DZ');
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('ar-DZ');
}
