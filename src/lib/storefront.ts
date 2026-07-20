/**
 * إعداد المتجر الإلكتروني (صفحة الهبوط).
 * فيديوهات الهبوط تُشغَّل متسلسلةً كأنها فيديو واحد (عند انتهاء مقطع يبدأ التالي).
 * ضَع ملفات MP4 في public/videos/ وسجّلها هنا بالترتيب المطلوب.
 */
export const LANDING_VIDEOS: string[] = [
  '/videos/landing-1.mp4',
  '/videos/landing-2.mp4',
  '/videos/landing-3.mp4',
];

/** نص صفحة الهبوط. */
export const STOREFRONT = {
  tagline: 'جمالكِ يبدأ من هنا',
  subtitle: 'عطور · شامبو · إكسسوارات — كل ما تحتاجينه في مكان واحد',
} as const;
