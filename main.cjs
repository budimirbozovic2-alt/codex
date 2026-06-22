const { app, session, ipcMain, protocol, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

// PRAVO RJEŠENJE: Aplikacija je u DEV modu samo ako nije zapakovana
// I ako je nismo eksplicitno pokrenuli u modu za testiranje produkcije (--verify-headers)
const isDev = !app.isPackaged && !process.argv.includes('--verify-headers');

// ── Register custom protocol BEFORE app.whenReady ──
// This gives us a stable origin (app://localhost) so IndexedDB 
// persists across restarts.
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

// ── Log rotation (5 MB cap, single .old.log archive) ──
const LOG_ROTATE_BYTES = 5 * 1024 * 1024;
const _rotating = new Set();
async function rotateLogIfNeeded(targetPath) {
  if (_rotating.has(targetPath)) return;
  _rotating.add(targetPath);
  try {
    let size = 0;
    try {
      const stat = await fsp.stat(targetPath);
      size = stat.size;
    } catch {
      return; 
    }
    if (size < LOG_ROTATE_BYTES) return;
    const oldPath = targetPath + '.old.log';
    try { await fsp.unlink(oldPath); } catch {}
    try { await fsp.rename(targetPath, oldPath); } catch {}
  } catch {
    // best-effort; never throw from log rotation
  } finally {
    _rotating.delete(targetPath);
  }
}

async function appendLogLine(targetPath, line) {
  try {
    await rotateLogIfNeeded(targetPath);
    await fsp.appendFile(targetPath, line);
  } catch {
    // best-effort
  }
}

// ── Global Error Handler ──
function logCrash(label, err) {
  const timestamp = new Date().toISOString();
  const msg = `[${timestamp}] ${label}: ${err?.stack || err}\n`;
  appendLogLine(crashLogPath, msg);
}

process.on('uncaughtException', (err) => logCrash('uncaughtException', err));
process.on('unhandledRejection', (reason) => logCrash('unhandledRejection', reason));

// ── IPC Origin Validation (Defense in Depth) ──
const DEV_SERVER_PORT = parseInt(process.env.VITE_DEV_SERVER_PORT || '8080', 10);
const DEV_SERVER_ORIGIN = `http://localhost:${DEV_SERVER_PORT}`;

function isTrustedSender(event) {
  try {
    const frame = event && event.senderFrame;
    const url = frame && frame.url;
    if (typeof url !== 'string' || url.length === 0) return false;
    if (url.startsWith('app://localhost')) return true;
    if (url.startsWith(`${DEV_SERVER_ORIGIN}/`) || url === DEV_SERVER_ORIGIN) return true;
    return false;
  } catch {
    return false;
  }
}

function assertTrustedSender(event) {
  if (!isTrustedSender(event)) {
    const url = (event && event.senderFrame && event.senderFrame.url) || '<unknown>';
    logCrash('ipc-origin-blocked', `Untrusted IPC sender: ${url}`);
    throw new Error('Unauthorized IPC origin');
  }
}

// ── Single Instance Lock ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {

const { createSplashWindow, createWindow } = require(path.join(__dirname, 'electron', 'window.cjs'));
const { setupBackupSystem } = require(path.join(__dirname, 'electron', 'backup.cjs'));
const { setupUpdater } = require(path.join(__dirname, 'electron', 'updater.cjs'));
const { setupSqliteIpc, closeMainSqlite } = require(path.join(__dirname, 'electron', 'sqlite-ipc.cjs'));

let mainWindow = null;
const setMainWindow = (win) => { mainWindow = win; };
const getMainWindow = () => mainWindow;

const backup = setupBackupSystem({
  app,
  getMainWindow,
  logCrash,
  isDev,
  assertTrustedSender,
});

setupUpdater({
  isDev,
  getMainWindow,
  assertTrustedSender,
  logCrash,
});

setupSqliteIpc({
  app,
  assertTrustedSender,
  logCrash,
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
  
  try {
    const real = fs.realpathSync.native(resolved);
    return dirs.some(dir => {
      let realDir;
      try { realDir = fs.realpathSync.native(dir); } catch { realDir = dir; }
      return real.startsWith(realDir + path.sep) || real === realDir;
    });
  } catch {
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
ipcMain.handle('log-error', async (event, message) => {
  assertTrustedSender(event);
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${typeof message === 'string' ? message : JSON.stringify(message)}\n`;
  await appendLogLine(rendererLogPath, line);
  return true;
});

// ── Native file dialogs ──
ipcMain.handle('show-save-dialog', async (event, options) => {
  assertTrustedSender(event);
  const win = getMainWindow();
  if (!win) return { canceled: true };
  return dialog.showSaveDialog(win, sanitizeDialogOptions(options));
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  assertTrustedSender(event);
  const win = getMainWindow();
  if (!win) return { canceled: true, filePaths: [] };
  return dialog.showOpenDialog(win, sanitizeDialogOptions(options));
});

// ── File operations ──
const MAX_SAVE_FILE_BYTES = 100 * 1024 * 1024;
const MAX_SAVE_FILE_BASE64_LEN = Math.ceil((MAX_SAVE_FILE_BYTES * 4) / 3) + 64;
const BASE64_RE = /^[A-Za-z0-9+/=\r\n]+$/;

ipcMain.handle('save-file', async (event, filePath, base64Data) => {
  assertTrustedSender(event);
  try {
    if (!isPathAllowed(filePath)) {
      logCrash('save-file-blocked', `Path not allowed: ${filePath}`);
      return false;
    }
    if (typeof base64Data !== 'string' || base64Data.length > MAX_SAVE_FILE_BASE64_LEN) {
      logCrash('save-file-too-large', 'Payload exceeds limit');
      return false;
    }
    const cleanBase64 = base64Data.replace(/^data:.*?;base64,/, '');
    if (!BASE64_RE.test(cleanBase64)) {
      logCrash('save-file-invalid-payload', 'Payload is not valid base64');
      return false;
    }
    await fsp.writeFile(filePath, Buffer.from(cleanBase64, 'base64'));
    return true;
  } catch (err) {
    logCrash('save-file', err);
    return false;
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  assertTrustedSender(event);
  try {
    if (!isPathAllowed(filePath)) {
      logCrash('read-file-blocked', `Path not allowed: ${filePath}`);
      return null;
    }
    const data = await fsp.readFile(filePath);
    return { data: data.toString('base64'), name: path.basename(filePath) };
  } catch (err) {
    logCrash('read-file', err);
    return null;
  }
});

// ── Binary IPC variants ──
const MAX_SAVE_FILE_BYTES_BIN = 500 * 1024 * 1024;

ipcMain.handle('save-file-bytes', async (event, filePath, bytes) => {
  assertTrustedSender(event);
  try {
    if (!isPathAllowed(filePath)) {
      logCrash('save-file-bytes-blocked', `Path not allowed: ${filePath}`);
      return false;
    }
    const buf = Buffer.isBuffer(bytes)
      ? bytes
      : (bytes instanceof Uint8Array ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) : null);
    if (!buf) {
       logCrash('save-file-bytes-invalid', `Payload is not bytes`);
      return false;
    }
    if (buf.length > MAX_SAVE_FILE_BYTES_BIN) {
      logCrash('save-file-bytes-too-large', `Payload exceeds limit`);
      return false;
    }
    await fsp.writeFile(filePath, buf);
    return true;
  } catch (err) {
    logCrash('save-file-bytes', err);
    return false;
  }
});

ipcMain.handle('read-file-bytes', async (event, filePath) => {
  assertTrustedSender(event);
  try {
    if (!isPathAllowed(filePath)) {
      logCrash('read-file-bytes-blocked', `Path not allowed: ${filePath}`);
      return null;
    }
    const data = await fsp.readFile(filePath);
    if (data.length > MAX_SAVE_FILE_BYTES_BIN) {
      logCrash('read-file-bytes-too-large', `File exceeds limit`);
      return null;
    }
    return { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), name: path.basename(filePath) };
  } catch (err) {
    logCrash('read-file-bytes', err);
    return null;
  }
});

app.whenReady().then(() => {
  // Production app:// protocol CSP
  const PROD_CSP = "default-src 'self' app:; script-src 'self' 'unsafe-inline' 'unsafe-eval' app:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: app:; font-src 'self' data: app:; connect-src 'self' blob: app:; media-src 'self' blob: app:; worker-src 'self' blob: app:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';";

  if (!isDev) {
    const distPath = path.join(__dirname, 'dist');
    const MIME_TYPES = {
      '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
      '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
      '.ttf': 'font/ttf', '.otf': 'font/otf',
    };
    const buildHeaders = (mime) => ({
      'Content-Type': mime,
      'Content-Security-Policy': PROD_CSP,
    });
    
    const serveIndex = async () => {
      const indexData = await fsp.readFile(path.join(distPath, 'index.html'));
      return new Response(indexData, {
        status: 200,
        headers: buildHeaders('text/html'),
      });
    };
    
    protocol.handle('app', async (request) => {
      try {
        const url = new URL(request.url);
        let filePath = path.join(distPath, decodeURIComponent(url.pathname));
        if (filePath.endsWith('/') || filePath === distPath) {
          filePath = path.join(distPath, 'index.html');
        }
        
        const resolved = path.resolve(filePath);
        if (resolved !== distPath && !resolved.startsWith(distPath + path.sep)) {
          logCrash('app-protocol-traversal-blocked', `Blocked: ${request.url}`);
          return serveIndex();
        }
        
        const ext = path.extname(resolved).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        
        try {
          const data = await fsp.readFile(resolved);
          return new Response(data, {
            status: 200,
            headers: buildHeaders(mime),
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

  // ── M-6 Fix: Permission lockdown (Whitelist Clipboard) ──
  const ALLOWED_PERMISSIONS = ['clipboard-read', 'clipboard-sanitized-write'];
  
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.includes(permission));
  });
  
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return ALLOWED_PERMISSIONS.includes(permission);
  });

  // ── Web-contents lockdown: block in-app navigation & new windows ──
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (event, navUrl) => {
      try {
        const u = new URL(navUrl);
        const allowedDev = isDev && u.origin === DEV_SERVER_ORIGIN;
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
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  if (process.argv.includes('--verify-headers')) {
    const { run } = require(path.join(__dirname, 'electron', 'verify-headers.cjs'));
    run().catch((err) => {
      console.error('[verify-headers] fatal:', err);
      app.exit(1);
    });
    return;
  }

  const splash = createSplashWindow(isDev, __dirname);
  createWindow({
    isDev,
    baseDir: __dirname,
    configPath,
    logCrash,
    splash,
    onMainWindow: setMainWindow,
    assertTrustedSender,
  });
});

let isQuitting = false;
app.on('before-quit', async (e) => {
  if (isQuitting) return;
  isQuitting = true;
  e.preventDefault();
  try {
    await backup.performBeforeQuitBackup();
  } catch (_) {}
  closeMainSqlite();
  app.exit(0);
});

app.on('second-instance', () => {
  const win = getMainWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  backup.cleanup();
  closeMainSqlite();
  if (process.platform !== 'darwin') app.quit();
});

}