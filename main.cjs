const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
const configPath = path.join(app.getPath('userData'), 'window-state.json');

// ── Single Instance Lock ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {

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
  const state = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  try { fs.writeFileSync(configPath, JSON.stringify(state)); } catch (_) {}
}

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 480,
    height: 360,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    icon: path.join(__dirname, 'public/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  splash.loadFile(path.join(__dirname, 'public/splash.html'));
  return splash;
}

let mainWindow = null;

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
    icon: path.join(__dirname, 'public/icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow = win;

  // ── Production: remove menu & block shortcuts ──
  if (!isDev) {
    Menu.setApplicationMenu(null);

    win.webContents.on('before-input-event', (event, input) => {
      // Block Ctrl+R, Ctrl+Shift+R, F5, Ctrl+Shift+I
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

  // Save window state on move/resize
  win.on('resize', () => saveWindowState(win));
  win.on('move', () => saveWindowState(win));

  win.once('ready-to-show', () => {
    setTimeout(() => {
      splash.destroy();
      win.show();
    }, 1800);
  });
}

// ── Auto-Backup (every 15 minutes, keep last 10) ──
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

function performAutoBackup() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
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
    if (!result) return;
    ensureBackupDir();
    const now = new Date();
    const ts = now.toISOString().replace(/[-:T]/g, '_').slice(0, 15);
    const filename = 'Memoria_AutoBackup_' + ts + '.json';
    fs.writeFileSync(path.join(BACKUP_DIR, filename), result);
    cleanOldBackups();
  }).catch(() => {});
}

let backupInterval = null;

app.whenReady().then(() => {
  const splash = createSplashWindow();
  createWindow(splash);

  // Start auto-backup every 15 minutes (production only)
  if (!isDev) {
    // First backup after 2 minutes
    setTimeout(() => {
      performAutoBackup();
      backupInterval = setInterval(performAutoBackup, BACKUP_INTERVAL_MS);
    }, 2 * 60 * 1000);
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
