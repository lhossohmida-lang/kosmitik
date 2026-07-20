/**
 * بعد `next build` (output: standalone) ننسخ الأصول الثابتة و public
 * داخل مجلد standalone حتى يخدمها الخادم المستقل، ثم يغلّفه electron-builder.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const standalone = path.join(root, '.next', 'standalone');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(standalone)) {
  console.error('لم يُعثر على .next/standalone — شغّل `next build` أولاً (output: standalone).');
  process.exit(1);
}

copyDir(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'));
copyDir(path.join(root, 'public'), path.join(standalone, 'public'));
console.log('✓ نُسخت الأصول الثابتة و public داخل standalone.');
