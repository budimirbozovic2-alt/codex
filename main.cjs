const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
const configPath = path.join(app.getPath('userData'), 'window-state.json');
const crashLogPath = path.join(app.getPath('userData'), 'crash.log');

// ── Resolve paths correctly for both dev and packaged builds ──
function getDistPath(...segments) {
  if (isDev) {
    return path.join(__dirname, ...segments);
  }
  // In packaged app, __dirname points to app.asar root
  return path.join(__dirname, 'dist', ...segments);
}

function getPublicPath(...segments) {
  if (isDev) {
    return path.join(__dirname, 'public', ...segments);
  }
  return path.join(__dirname, 'dist', ...segments);
}

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

// ── Window State Persistence ──
function loadWindowState() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (_) {}
  return { width: 1200, height: 800 };
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    }));
  } catch (_) {}
}

// ── Splash Screen ──
function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 480,
    height: 360,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    icon: getPublicPath('icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  splash.loadFile(getPublicPath('splash.html'));
  splash.on('closed', () => {}); // prevent crash if destroyed early
  return splash;
}

let mainWindow = null;
let appReady = false;

// ── Main Window ──
function createWindow(splash) {
  const saved = loadWindowState();

  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 900,
    minHeight: 670,
    show: false,
    icon: getPublicPath('icon.ico'),
    backgroundColor: '#0a1628', // match dark blue splash bg
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  });

  mainWindow = win;

  // ── Production: remove menu & block shortcuts ──
  if (!isDev) {
    Menu.setApplicationMenu(null);
    win.webContents.on('before-input-event', (event, input) => {
      if (
        (input.control && input.key.toLowerCase() === 'r') ||
        input.key === 'F5' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i')
      ) {
        event.preventDefault();
      }
    });
  }

  // ── Load content ──
  if (isDev) {
    win.loadURL('http://localhost:8080');
  } else {
    // Use absolute file:// URL to prevent path resolution issues in asar
    const indexPath = getDistPath('index.html');
    win.loadFile(indexPath).catch((err) => {
      logCrash('loadFile-failed', err);
      // Fallback: try URL-based loading
      const fallbackUrl = `file://${indexPath.replace(/\\/g, '/')}`;
      win.loadURL(fallbackUrl).catch((err2) => logCrash('loadURL-fallback-failed', err2));
    });
  }

  // ── Handle load failures (white screen prevention) ──
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logCrash('did-fail-load', `${errorCode}: ${errorDescription} @ ${validatedURL}`);
    // Retry once after short delay
    setTimeout(() => {
      if (!win.isDestroyed()) {
        if (isDev) {
          win.loadURL('http://localhost:8080');
        } else {
          win.loadFile(getDistPath('index.html')).catch(() => {});
        }
      }
    }, 2000);
  });

  // ── Renderer crash recovery ──
  win.webContents.on('render-process-gone', (_event, details) => {
    logCrash('render-process-gone', JSON.stringify(details));
    if (!win.isDestroyed()) {
      // Reset the ready flag so new window can register renderer-ready
      appReady = false;
      // Remove old listener to prevent leak
      ipcMain.removeAllListeners('renderer-ready');
      win.destroy();
      const newSplash = createSplashWindow();
      createWindow(newSplash);
    }
  });

  win.webContents.on('unresponsive', () => {
    logCrash('unresponsive', 'Window became unresponsive');
  });

  win.webContents.on('responsive', () => {
    // Window recovered from unresponsive state
  });

  // Save window state on move/resize (debounced)
  let saveTimeout = null;
  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveWindowState(win), 500);
  };
  win.on('resize', debouncedSave);
  win.on('move', debouncedSave);

  // Show window when renderer signals ready (or fallback timeout)
  const showWindow = () => {
    if (appReady) return;
    appReady = true;
    if (!splash.isDestroyed()) splash.destroy();
    if (!win.isDestroyed()) win.show();
  };

  // Renderer signals it's ready via IPC
  ipcMain.once('renderer-ready', showWindow);

  // Fallback: show after max 8 seconds regardless
  const fallbackTimer = setTimeout(showWindow, 8000);

  win.once('ready-to-show', () => {
    // Give renderer 500ms minimum to paint after DOM ready
    setTimeout(() => {
      if (!appReady) {
        // Still waiting for renderer-ready, set a shorter fallback
        clearTimeout(fallbackTimer);
        setTimeout(showWindow, 3000);
      }
    }, 500);
  });
}

// ── Auto-Backup System ──
const BACKUP_DIR = path.join(app.getPath('documents'), 'CodexBackups');
const MAX_BACKUPS = 10;
const BACKUP_INTERVAL_MS = 15 * 60 * 1000;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function cleanOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('Memoria_AutoBackup_') && f.endsWith('.json'))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    while (files.length > MAX_BACKUPS) {
      const old = files.pop();
      if (old) fs.unlinkSync(path.join(BACKUP_DIR, old.name));
    }
  } catch (_) {}
}

function writeBackup(jsonString) {
  try {
    ensureBackupDir();
    const now = new Date();
    const ts = now.toISOString().replace(/[-:T]/g, '_').slice(0, 15);
    const filename = `Memoria_AutoBackup_${ts}.json`;
    fs.writeFileSync(path.join(BACKUP_DIR, filename), jsonString);
    cleanOldBackups();
    return true;
  } catch (err) {
    logCrash('backup-error', err);
    return false;
  }
}

// Auto-backup via IPC — renderer sends data when requested
function performAutoBackup() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('backup-requested');
}

// ── IPC Handlers ──
ipcMain.handle('request-backup', async (_event, jsonData) => {
  if (typeof jsonData === 'string' && jsonData.length > 2) {
    return writeBackup(jsonData);
  }
  return false;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

let backupInterval = null;

app.whenReady().then(() => {
  const splash = createSplashWindow();
  createWindow(splash);

  if (!isDev) {
    // Start auto-backup after 2 minutes
    setTimeout(() => {
      performAutoBackup();
      backupInterval = setInterval(performAutoBackup, BACKUP_INTERVAL_MS);
    }, 2 * 60 * 1000);
  }
});

// Before quit: request final backup
app.on('before-quit', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('backup-requested');
  }
});

// ── Focus existing window if second instance attempted ──
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (backupInterval) clearInterval(backupInterval);
  if (process.platform !== 'darwin') app.quit();
});

} // end of gotLock else block
