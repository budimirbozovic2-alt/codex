const { BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Resolve paths correctly for both dev and packaged builds ──
function getDistPath(isDev, baseDir, ...segments) {
  if (isDev) return path.join(baseDir, ...segments);
  return path.join(baseDir, 'dist', ...segments);
}

function getPublicPath(isDev, baseDir, ...segments) {
  if (isDev) return path.join(baseDir, 'public', ...segments);
  return path.join(baseDir, 'dist', ...segments);
}

// ── Window State Persistence ──
function loadWindowState(configPath) {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (_) {}
  return { width: 1200, height: 800 };
}

function saveWindowState(win, configPath) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    }));
  } catch (_) {}
}

// ── Splash Screen ──
function createSplashWindow(isDev, baseDir) {
  const splash = new BrowserWindow({
    width: 480,
    height: 360,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    icon: getPublicPath(isDev, baseDir, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  splash.loadFile(getPublicPath(isDev, baseDir, 'splash.html'));
  splash.on('closed', () => {});
  return splash;
}

// ── Crash recovery tracking ──
const MAX_CRASHES = 3;
const CRASH_WINDOW_MS = 60000;
let crashTimestamps = [];

function shouldAllowRecovery() {
  const now = Date.now();
  crashTimestamps = crashTimestamps.filter(t => now - t < CRASH_WINDOW_MS);
  crashTimestamps.push(now);
  return crashTimestamps.length <= MAX_CRASHES;
}

// ── Main Window ──
function createWindow({ isDev, baseDir, configPath, logCrash, splash, onMainWindow }) {
  const saved = loadWindowState(configPath);

  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 900,
    minHeight: 670,
    show: false,
    icon: getPublicPath(isDev, baseDir, 'icon.ico'),
    backgroundColor: '#0a1628',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(baseDir, 'preload.cjs'),
      sandbox: true,
    },
  });

  onMainWindow(win);

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
    const indexPath = getDistPath(isDev, baseDir, 'index.html');
    win.loadFile(indexPath).catch((err) => {
      logCrash('loadFile-failed', err);
      const fallbackUrl = `file://${indexPath.replace(/\\/g, '/')}`;
      win.loadURL(fallbackUrl).catch((err2) => logCrash('loadURL-fallback-failed', err2));
    });
  }

  // ── Handle load failures ──
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logCrash('did-fail-load', `${errorCode}: ${errorDescription} @ ${validatedURL}`);
    setTimeout(() => {
      if (!win.isDestroyed()) {
        if (isDev) {
          win.loadURL('http://localhost:8080');
        } else {
          win.loadFile(getDistPath(isDev, baseDir, 'index.html')).catch(() => {});
        }
      }
    }, 2000);
  });

  // ── Renderer crash recovery with limit ──
  let appReady = false;
  win.webContents.on('render-process-gone', (_event, details) => {
    logCrash('render-process-gone', JSON.stringify(details));
    if (!win.isDestroyed()) {
      if (shouldAllowRecovery()) {
        appReady = false;
        ipcMain.removeAllListeners('renderer-ready');
        win.destroy();
        const newSplash = createSplashWindow(isDev, baseDir);
        createWindow({ isDev, baseDir, configPath, logCrash, splash: newSplash, onMainWindow });
      } else {
        logCrash('crash-loop-detected', 'Too many crashes, not recovering');
        const { dialog } = require('electron');
        dialog.showErrorBox(
          'Aplikacija se neprestano ruši',
          'Renderer proces je pao više od 3 puta u zadnjih 60 sekundi. Aplikacija će se zatvoriti. Pokušajte ponovo pokrenuti.'
        );
        win.destroy();
        require('electron').app.quit();
      }
    }
  });

  win.webContents.on('unresponsive', () => {
    logCrash('unresponsive', 'Window became unresponsive');
  });

  // Save window state on move/resize (debounced)
  let saveTimeout = null;
  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveWindowState(win, configPath), 500);
  };
  win.on('resize', debouncedSave);
  win.on('move', debouncedSave);

  // Show window when renderer signals ready (or fallback timeout)
  const showWindow = () => {
    if (appReady) return;
    appReady = true;
    if (splash && !splash.isDestroyed()) splash.destroy();
    if (!win.isDestroyed()) win.show();
  };

  ipcMain.once('renderer-ready', showWindow);

  const fallbackTimer = setTimeout(showWindow, 6000);

  win.once('ready-to-show', () => {
    setTimeout(() => {
      if (!appReady) {
        clearTimeout(fallbackTimer);
        setTimeout(showWindow, 3000);
      }
    }, 500);
  });
}

module.exports = { createSplashWindow, createWindow };
