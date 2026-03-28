const { app, session, ipcMain, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

// ── Register custom protocol BEFORE app.whenReady ──
// This gives us a stable origin (app://localhost) so IndexedDB persists across restarts.
// Under file:// the origin is opaque/null and Chromium may wipe storage.
if (!isDev) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        bypassCSP: false,
        corsEnabled: true,
      },
    },
  ]);
}
const configPath = path.join(app.getPath('userData'), 'window-state.json');
const crashLogPath = path.join(app.getPath('userData'), 'crash.log');
const rendererLogPath = path.join(app.getPath('userData'), 'renderer-errors.log');

// ── Global Error Handler ──
function logCrash(label, err) {
  const timestamp = new Date().toISOString();
  const msg = `[${timestamp}] ${label}: ${err?.stack || err}\n`;
  try { fs.appendFileSync(crashLogPath, msg); } catch (_) {}
}

process.on('uncaughtException', (err) => logCrash('uncaughtException', err));
process.on('unhandledRejection', (reason) => logCrash('unhandledRejection', reason));

// ── Single Instance Lock ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {

const { createSplashWindow, createWindow } = require(path.join(__dirname, 'electron', 'window.cjs'));
const { setupBackupSystem } = require(path.join(__dirname, 'electron', 'backup.cjs'));

let mainWindow = null;

const setMainWindow = (win) => { mainWindow = win; };
const getMainWindow = () => mainWindow;

const backup = setupBackupSystem({
  app,
  getMainWindow,
  logCrash,
  isDev,
});

// ── Renderer error logging IPC ──
ipcMain.handle('log-error', (_event, message) => {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${typeof message === 'string' ? message : JSON.stringify(message)}\n`;
  try { fs.appendFileSync(rendererLogPath, line); } catch (_) {}
  return true;
});

app.whenReady().then(() => {
  // ── Register app:// protocol handler for production ──
  if (!isDev) {
    const distPath = path.join(__dirname, 'dist');
    protocol.handle('app', (request) => {
      const url = new URL(request.url);
      let filePath = path.join(distPath, decodeURIComponent(url.pathname));
      // Default to index.html for root or directory requests
      if (filePath.endsWith('/') || filePath === distPath) {
        filePath = path.join(distPath, 'index.html');
      }
      return net.fetch('file://' + filePath.replace(/\\/g, '/'));
    });
  }

  // ── CSP headers in production ──
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      // Skip CSP for file:// and app:// — 'self' works with app:// but we keep it simple
      if (details.url.startsWith('file://')) {
        return callback({ responseHeaders: details.responseHeaders });
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' app:; script-src 'self' 'unsafe-inline' app:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: app:; font-src 'self' data: app:; connect-src 'self' app:;"
          ],
        },
      });
    });
  }

  const splash = createSplashWindow(isDev, __dirname);
  createWindow({
    isDev,
    baseDir: __dirname,
    configPath,
    logCrash,
    splash,
    onMainWindow: setMainWindow,
  });
});

// Before quit: wait for backup to finish (with timeout)
let isQuitting = false;
app.on('before-quit', async (e) => {
  if (isQuitting) return;
  isQuitting = true;
  e.preventDefault();
  try {
    await backup.performBeforeQuitBackup();
  } catch (_) {}
  app.quit();
});

// ── Focus existing window if second instance attempted ──
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  backup.cleanup();
  if (process.platform !== 'darwin') app.quit();
});

} // end of gotLock else block
