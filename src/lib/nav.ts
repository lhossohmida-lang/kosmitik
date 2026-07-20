/**
 * تعريف واحد لعناصر التنقّل — يشترك فيه الشريط الجانبي (حاسوب)
 * والشريط السفلي (هاتف). أضِف صفحة جديدة هنا لتظهر في الواجهتين.
 */
export type NavItem = {
  href: string;
  labelKey: string;
  icon: string; // رمز احتياطي (emoji) يظهر إن لم تُوجد صورة الأيقونة
  /** مسار أيقونة ثلاثية الأبعاد (PNG في public/icons/)؛ إن وُجد يُعرَض بدل الـ emoji. */
  img?: string;
  /** يظهر في الشريط السفلي للهاتف (نُبقيه مختصراً على 5 عناصر). */
  primary?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: '🏠', img: '/icons/dashboard.png', primary: true },
  { href: '/pos', labelKey: 'nav.pos', icon: '🛒', img: '/icons/pos.png', primary: true },
  { href: '/products', labelKey: 'nav.products', icon: '📦', img: '/icons/products.png', primary: true },
  { href: '/credits', labelKey: 'nav.credits', icon: '📒', img: '/icons/credits.png', primary: true },
  { href: '/purchases', labelKey: 'nav.purchases', icon: '🚚', img: '/icons/purchases.png' },
  { href: '/suppliers', labelKey: 'nav.suppliers', icon: '🏭', img: '/icons/suppliers.png' },
  { href: '/reports', labelKey: 'nav.reports', icon: '📊', img: '/icons/reports.png', primary: true },
  { href: '/store', labelKey: 'nav.store', icon: '🛍️', img: '/icons/store.png', primary: true },
  { href: '/workers', labelKey: 'nav.workers', icon: '👷', img: '/icons/workers.png' },
  { href: '/cash', labelKey: 'nav.cash', icon: '💵', img: '/icons/cash.png' },
  { href: '/expenses', labelKey: 'nav.expenses', icon: '🧾', img: '/icons/expenses.png' },
  { href: '/ai', labelKey: 'nav.ai', icon: '🤖', img: '/icons/ai.png' },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((i) => i.primary);
