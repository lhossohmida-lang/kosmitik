/**
 * عملية Electron الرئيسية (نسخة الحاسوب / EXE).
 * - في التطوير: يحمّل خادم Next على localhost:3000.
 * - في النسخة المغلّفة: يخدم **التصدير الثابت** (out/) عبر خادم محلي بسيط (بلا خادم Next).
 *   هذا يتيح التشغيل على Electron 22 (Node 16) المتوافق مع **Windows 7 / 32-bit**،
 *   إذ لا يعتمد على تشغيل خادم Next المستقل (الذي يتطلّب Node 18+).
 * - الطباعة الحرارية الصامتة عبر IPC باكتشاف تلقائي لاسم الطابعة.
 */
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const isDev = !app.isPackaged;
const PORT = process.env.PORT || 3020;
let staticServer = null;
let mainWindow = null;
let customerWin = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

/** خادم ملفّات ثابت بسيط (يدعم trailingSlash ومسارات _next والأصول). */
function startStaticServer(rootDir, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
        if (pathname.endsWith('/')) pathname += 'index.html';
        let filePath = path.normalize(path.join(rootDir, pathname));
        if (!filePath.startsWith(rootDir)) { res.writeHead(403); return res.end(); }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          if (fs.existsSync(filePath + '.html')) filePath += '.html';
          else if (fs.existsSync(path.join(filePath, 'index.html'))) filePath = path.join(filePath, 'index.html');
          else filePath = path.join(rootDir, 'index.html'); // احتياطي (توجيه من طرف العميل)
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } catch {
        res.writeHead(500); res.end('error');
      }
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${port}/`));
  });
}

async function startServer() {
  if (isDev) return 'http://localhost:3000';
  // out/ تُنسخ إلى resources/app عبر extraResources في package.json.
  const appDir = path.join(process.resourcesPath, 'app');
  const url = await startStaticServer(appDir, PORT);
  staticServer = url;
  return url;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  try {
    const url = await startServer();
    await mainWindow.loadURL(url);
  } catch (e) {
    mainWindow.loadURL('data:text/html,<h2 dir=rtl>تعذّر تحميل التطبيق</h2>');
  }
  mainWindow.show();
}

// ---------- شاشة الزبون (الشاشة الثانية) ----------
// تعرض المجموع الكلي أثناء البيع، واسم «deku» عند الخمول (سلة فارغة/خانة أخرى).
function createCustomerDisplay() {
  try {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const external = displays.find((d) => d.id !== primary.id);
    if (!external) return; // لا شاشة ثانية

    customerWin = new BrowserWindow({
      x: external.bounds.x,
      y: external.bounds.y,
      width: external.bounds.width,
      height: external.bounds.height,
      fullscreen: true,
      frame: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: { preload: path.join(__dirname, 'customer-preload.js'), contextIsolation: true },
    });
    customerWin.setMenuBarVisibility(false);
    customerWin.loadFile(path.join(__dirname, 'customer.html'));
    customerWin.on('closed', () => { customerWin = null; });
  } catch {
    /* شاشة الزبون غير حرجة */
  }
}

// إعادة توجيه تحديثات نقطة البيع إلى شاشة الزبون.
ipcMain.on('cd-update', (_e, payload) => {
  if (customerWin && !customerWin.isDestroyed()) {
    customerWin.webContents.send('cd-update', payload || { idle: true });
  }
});

app.whenReady().then(async () => {
  await createWindow();
  createCustomerDisplay();
  // إن وُصلت الشاشة الثانية لاحقاً أثناء التشغيل، أنشئ شاشة الزبون تلقائياً.
  screen.on('display-added', () => {
    if (!customerWin) createCustomerDisplay();
  });
  screen.on('display-removed', () => {
    if (customerWin && screen.getAllDisplays().length < 2) {
      customerWin.close();
      customerWin = null;
    }
  });
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- الطباعة التلقائية الصامتة (أي طابعة متصلة بالحاسوب) ----------
const THERMAL_RE = /xp|pos|80|thermal|receipt/i;
// طابعات افتراضية (PDF/XPS/Fax) لا تُختار تلقائياً إن وُجد بديل حقيقي.
const VIRTUAL_RE = /pdf|xps|onenote|fax|send to/i;

function pickPrinter(printers) {
  if (!printers || !printers.length) return null;
  const envName = process.env.POS_PRINTER_NAME;
  if (envName) {
    const m = printers.find((p) => p.name === envName);
    if (m) return m;
  }
  const thermal = printers.find((p) => THERMAL_RE.test(p.name));
  if (thermal) return thermal;
  const real = printers.filter((p) => !VIRTUAL_RE.test(p.name));
  const pool = real.length ? real : printers;
  return pool.find((p) => p.isDefault) || pool[0];
}

ipcMain.on('print-receipt', async (_e, payload) => {
  const { html, height, widthMicrons, heightMicrons, kind } = payload || {};
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const printers = await win.webContents.getPrintersAsync();
    let target = pickPrinter(printers);

    // ملصقات: إن حُدّدت طابعة ملصقات مخصّصة عبر POS_LABEL_PRINTER_NAME نستخدمها.
    if (kind === 'label' && process.env.POS_LABEL_PRINTER_NAME) {
      const lbl = printers.find((p) => p.name === process.env.POS_LABEL_PRINTER_NAME);
      if (lbl) target = lbl;
    }

    const isThermal = target ? THERMAL_RE.test(target.name) : false;

    const options = {
      silent: true,
      printBackground: true,
      deviceName: target ? target.name : undefined,
    };

    if (widthMicrons) {
      // مقاس مخصّص (ملصق 40×20mm…): العرض والارتفاع مضبوطان بالميكرون.
      options.margins = { marginType: 'none' };
      options.pageSize = {
        width: widthMicrons,
        height: heightMicrons || Math.round(Math.max(20, height) * 264.5833),
      };
    } else if (isThermal) {
      // وصل حراري: عرض الورق تلقائي —
      //  POS_PAPER_WIDTH_MM (يدوي) > اسم الطابعة فيه 58 → 48mm قابل للطباعة > افتراضي 72mm (ورق 80).
      let paperW = 72000;
      const envW = parseInt(process.env.POS_PAPER_WIDTH_MM || '', 10);
      if (Number.isFinite(envW) && envW >= 30 && envW <= 90) paperW = envW * 1000;
      else if (target && /58/.test(target.name)) paperW = 48000;
      // px → microns (1px = 264.5833µm) + 15mm تغذية للقاطع.
      const h = Math.round((Math.max(50, height) + 57) * 264.5833);
      options.margins = { marginType: 'none' };
      options.pageSize = { width: paperW, height: h };
    } else {
      // طابعة عادية (A4/Letter): نترك المقاس الافتراضي بلا تشويه.
      options.margins = { marginType: 'default' };
    }

    win.webContents.print(options, () => win.close());
  } catch {
    win.close();
  }
});
