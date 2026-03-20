const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
const configPath = path.join(app.getPath('userData'), 'window-state.json');
const crashLogPath = path.join(app.getPath('userData'), 'crash.log');

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
    icon: path.join(__dirname, isDev ? 'public/favicon.ico' : 'dist/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  splash.loadFile(path.join(__dirname, isDev ? 'public/splash.html' : 'dist/splash.html'));
  return splash;
}

let mainWindow = null;

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
    icon: path.join(__dirname, isDev ? 'public/favicon.ico' : 'dist/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // Sandbox disabled to allow preload access — contextIsolation still protects
      sandbox: false,
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

  if (isDev) {
    win.loadURL('http://localhost:8080');
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  // Save window state on move/resize (debounced)
  let saveTimeout = null;
  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveWindowState(win), 500);
  };
  win.on('resize', debouncedSave);
  win.on('move', debouncedSave);

  // Show window once ready (splash covers loading)
  win.once('ready-to-show', () => {
    setTimeout(() => {
      if (!splash.isDestroyed()) splash.destroy();
      win.show();
    }, 1800);
  });
}

// ── Auto-Backup System ──
const BACKUP_DIR = path.join(app.getPath('documents'), 'MemoriaBackups');
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

// Auto-backup via executeJavaScript — reads both localStorage and triggers IDB export
function performAutoBackup() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // Ask renderer to prepare backup data (reads from IndexedDB via IPC)
  mainWindow.webContents.executeJavaScript(`
    (function() {
      try {
        var keys = ['sr-essay-cards', 'sr-essay-categories', 'sr-essay-subcategories', 'sr-review-log', 'sr-settings'];
        var data = {};
        keys.forEach(function(k) { var v = localStorage.getItem(k); if (v) data[k] = JSON.parse(v); });
        return JSON.stringify(data, null, 2);
      } catch(e) { return null; }
    })()
  `).then(result => {
    if (result) writeBackup(result);
  }).catch(() => {});
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

// ── DB Integrity Check ──
function checkDatabaseIntegrity() {
  // Verify localStorage backup exists and is valid JSON
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindow.webContents.executeJavaScript(`
    (function() {
      try {
        var cardsRaw = localStorage.getItem('sr-essay-cards');
        if (!cardsRaw) return JSON.stringify({ status: 'empty' });
        var cards = JSON.parse(cardsRaw);
        if (!Array.isArray(cards)) return JSON.stringify({ status: 'corrupt', error: 'cards is not an array' });
        var invalid = cards.filter(function(c) { return !c.id || !c.question; }).length;
        return JSON.stringify({ status: 'ok', total: cards.length, invalid: invalid });
      } catch(e) {
        return JSON.stringify({ status: 'corrupt', error: e.message });
      }
    })()
  `).then(result => {
    try {
      const report = JSON.parse(result);
      const logLine = '[' + new Date().toISOString() + '] DB Integrity: ' + JSON.stringify(report) + '\\n';
      fs.appendFileSync(path.join(app.getPath('userData'), 'integrity.log'), logLine);

      if (report.status === 'corrupt') {
        // Attempt recovery from latest backup
        const backupFiles = fs.readdirSync(BACKUP_DIR)
          .filter(f => f.startsWith('Memoria_AutoBackup_') && f.endsWith('.json'))
          .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
          .sort((a, b) => b.time - a.time);

        if (backupFiles.length > 0) {
          const latestBackup = fs.readFileSync(path.join(BACKUP_DIR, backupFiles[0].name), 'utf-8');
          const parsed = JSON.parse(latestBackup);

          // Restore to localStorage
          mainWindow.webContents.executeJavaScript(`
            (function() {
              var data = ${JSON.stringify(parsed)};
              Object.keys(data).forEach(function(k) {
                localStorage.setItem(k, JSON.stringify(data[k]));
              });
              location.reload();
            })()
          `).catch(() => {});
          logCrash('integrity-recovery', 'Restored from backup: ' + backupFiles[0].name);
        }
      }
    } catch (_) {}
  }).catch(() => {});
}

let backupInterval = null;

app.whenReady().then(() => {
  const splash = createSplashWindow();
  createWindow(splash);

  if (!isDev) {
    // First backup + integrity check after 2 minutes
    setTimeout(() => {
      checkDatabaseIntegrity();
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
