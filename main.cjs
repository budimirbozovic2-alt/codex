const { app, session, ipcMain, protocol, dialog, shell } = require('electron');
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

// ── K1 Fix: Path validation helper ──
const ALLOWED_DIRS = () => [
  app.getPath('documents'),
  app.getPath('downloads'),
  app.getPath('desktop'),
];

function isPathAllowed(filePath) {
  const resolved = path.resolve(filePath);
  const dirs = ALLOWED_DIRS();
  const matchesPlain = dirs.some(dir => resolved.startsWith(dir + path.sep) || resolved === dir);
  if (!matchesPlain) return false;
  // Defense-in-depth: resolve symlinks (when target exists) to prevent symlink-bypass.
  try {
    const real = fs.realpathSync.native(resolved);
    return dirs.some(dir => {
      let realDir;
      try { realDir = fs.realpathSync.native(dir); } catch { realDir = dir; }
      return real.startsWith(realDir + path.sep) || real === realDir;
    });
  } catch {
    // Path doesn't exist yet (e.g. save-file target) — plain check is sufficient.
    return true;
  }
}

// ── K2 Fix: Dialog options whitelist ──
const DIALOG_ALLOWED_KEYS = ['defaultPath', 'filters', 'properties', 'title', 'buttonLabel', 'message'];
function sanitizeDialogOptions(options) {
  if (!options || typeof options !== 'object') return {};
  const clean = {};
  for (const key of DIALOG_ALLOWED_KEYS) {
    if (key in options) clean[key] = options[key];
  }
  return clean;
}

// ── Renderer error logging IPC ──
ipcMain.handle('log-error', (_event, message) => {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${typeof message === 'string' ? message : JSON.stringify(message)}\n`;
  try { fs.appendFileSync(rendererLogPath, line); } catch (_) {}
  return true;
});

// ── Native file dialogs (K2: sanitized options) ──
ipcMain.handle('show-save-dialog', async (_event, options) => {
  const win = getMainWindow();
  if (!win) return { canceled: true };
  return dialog.showSaveDialog(win, sanitizeDialogOptions(options));
});

ipcMain.handle('show-open-dialog', async (_event, options) => {
  const win = getMainWindow();
  if (!win) return { canceled: true, filePaths: [] };
  return dialog.showOpenDialog(win, sanitizeDialogOptions(options));
});

// ── File operations (K1: path validation, B1/B2: async FS, I1: size cap) ──
const MAX_SAVE_FILE_BYTES = 100 * 1024 * 1024; // 100 MB raw
// Base64 expands by 4/3 (≈1.3334). Use exact ratio + small slack for data: prefix.
const MAX_SAVE_FILE_BASE64_LEN = Math.ceil((MAX_SAVE_FILE_BYTES * 4) / 3) + 64;
const BASE64_RE = /^[A-Za-z0-9+/=\r\n]+$/;

ipcMain.handle('save-file', async (_event, filePath, base64Data) => {
  try {
    if (!isPathAllowed(filePath)) {
      logCrash('save-file-blocked', `Path not allowed: ${filePath}`);
      return false;
    }
    if (typeof base64Data !== 'string' || base64Data.length > MAX_SAVE_FILE_BASE64_LEN) {
      logCrash('save-file-too-large', `Payload exceeds limit: ${typeof base64Data === 'string' ? base64Data.length : 'non-string'} bytes`);
      return false;
    }
    const cleanBase64 = base64Data.replace(/^data:.*?;base64,/, '');
    if (!BASE64_RE.test(cleanBase64)) {
      logCrash('save-file-invalid-payload', 'Payload is not valid base64');
      return false;
    }
    await fs.promises.writeFile(filePath, Buffer.from(cleanBase64, 'base64'));
    return true;
  } catch (err) {
    logCrash('save-file', err);
    return false;
  }
});

ipcMain.handle('read-file', async (_event, filePath) => {
  try {
    if (!isPathAllowed(filePath)) {
      logCrash('read-file-blocked', `Path not allowed: ${filePath}`);
      return null;
    }
    const data = await fs.promises.readFile(filePath);
    return { data: data.toString('base64'), name: path.basename(filePath) };
  } catch (err) {
    logCrash('read-file', err);
    return null;
  }
});

app.whenReady().then(() => {
  // ── Register app:// protocol handler for production ──
  if (!isDev) {
    const distPath = path.join(__dirname, 'dist');
    const MIME_TYPES = {
      '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
      '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
      '.ttf': 'font/ttf', '.otf': 'font/otf',
    };
    const serveIndex = async () => {
      const indexData = await fs.promises.readFile(path.join(distPath, 'index.html'));
      return new Response(indexData, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    };
    protocol.handle('app', async (request) => {
      try {
        const url = new URL(request.url);
        let filePath = path.join(distPath, decodeURIComponent(url.pathname));
        if (filePath.endsWith('/') || filePath === distPath) {
          filePath = path.join(distPath, 'index.html');
        }
        // ── Path traversal guard: ensure resolved path stays inside distPath ──
        const resolved = path.resolve(filePath);
        if (resolved !== distPath && !resolved.startsWith(distPath + path.sep)) {
          logCrash('app-protocol-traversal-blocked', `Blocked: ${request.url} → ${resolved}`);
          return serveIndex();
        }
        const ext = path.extname(resolved).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        try {
          const data = await fs.promises.readFile(resolved);
          return new Response(data, {
            status: 200,
            headers: { 'Content-Type': mime },
          });
        } catch {
          return serveIndex();
        }
      } catch (err) {
        logCrash('app-protocol-handler', err);
        return serveIndex();
      }
    });
  }

  // ── CSP headers in production ──
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (details.url.startsWith('file://')) {
        return callback({ responseHeaders: details.responseHeaders });
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' app:; script-src 'self' 'unsafe-inline' app:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: app:; font-src 'self' data: app:; connect-src 'self' blob: app:; media-src 'self' blob: app:;"
          ],
        },
      });
    });
  }

  // ── Web-contents lockdown: block in-app navigation & new windows ──
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (event, navUrl) => {
      try {
        const u = new URL(navUrl);
        const allowedDev = isDev && u.origin === 'http://localhost:8080';
        const allowedProd = !isDev && u.protocol === 'app:';
        if (!allowedDev && !allowedProd) {
          event.preventDefault();
          if (/^https?:$/i.test(u.protocol)) shell.openExternal(navUrl);
        }
      } catch {
        event.preventDefault();
      }
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    // Disable webview tag entirely
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

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

// ── G1 Fix: Use app.exit(0) instead of app.quit() to avoid recursive before-quit ──
let isQuitting = false;
app.on('before-quit', async (e) => {
  if (isQuitting) return;
  isQuitting = true;
  e.preventDefault();
  try {
    await backup.performBeforeQuitBackup();
  } catch (_) {}
  app.exit(0);
});

// ── Focus existing window if second instance attempted ──
app.on('second-instance', () => {
  const win = getMainWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  backup.cleanup();
  if (process.platform !== 'darwin') app.quit();
});

} // end of gotLock else block
