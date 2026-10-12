// Class Planner for Windows: a plain window around the same offline page the phone app uses.
// No network access is used. All data lives in this computer's app-data folder (localStorage).
const { app, BrowserWindow, Menu, protocol, shell, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

const SMOKE = process.argv.find((a) => a.startsWith('--smoke='));
const SMOKE_OUT = SMOKE ? SMOKE.slice(8) : null;
if (SMOKE_OUT) app.setPath('userData', path.join(app.getPath('temp'), 'classplanner-smoke-' + process.pid));

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let win = null;
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (e) { return {}; }
}
function saveState() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds();
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, max: win.isMaximized() }));
  } catch (e) {}
}

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    width: st.width || 1180, height: st.height || 820, x: st.x, y: st.y, minWidth: 360, minHeight: 520,
    title: 'Class Planner', icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14161f' : '#f4f5fb',
    autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', saveState);
  win.on('page-title-updated', (e) => e.preventDefault());
  // keep the app on its own page; anything else opens in the browser
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  // saving a backup or report: Windows shows its normal Save As box (Electron default)
  win.loadURL('app://classplanner/index.html');
  if (SMOKE_OUT) runSmoke();
}

function runSmoke() {
  const report = (ok, msg) => { try { fs.writeFileSync(SMOKE_OUT, (ok ? 'OK ' : 'FAIL ') + msg + '\n'); } catch (e) {} app.exit(ok ? 0 : 1); };
  setTimeout(() => report(false, 'timed out waiting for the page'), 40000);
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const r = await win.webContents.executeJavaScript(
        "(function(){try{localStorage.setItem('smoke','1');var ok=localStorage.getItem('smoke')==='1';localStorage.removeItem('smoke');" +
        "return JSON.stringify({title:(document.querySelector('h1')||{}).textContent,cp:typeof window.__cp,ls:ok,native:typeof window.AndroidBridge,mode:window.__cp&&window.__cp.S.mode})}catch(e){return 'ERR '+e}})()");
      const o = JSON.parse(r);
      const good = o.title === 'Class Planner' && o.cp === 'object' && o.ls && o.native === 'undefined' && o.mode === 'local';
      report(good, r);
    } catch (e) { report(false, String(e)); }
  });
}

if (!app.requestSingleInstanceLock() && !SMOKE_OUT) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    const page = path.join(__dirname, 'app', 'index.html');
    protocol.handle('app', (req) => {
      const u = new URL(req.url);
      if (u.pathname === '/' || u.pathname === '/index.html') {
        return new Response(fs.readFileSync(page), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      }
      return new Response('Not found', { status: 404 });
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn', accelerator: 'CommandOrControl+=' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] }
    ]));
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
