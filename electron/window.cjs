const { BrowserWindow, Menu, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Resolve preload path for both dev and packaged builds ──
function resolvePreloadPath(isDev, baseDir) {
  if (isDev) {
    return path.join(baseDir, 'preload.cjs');
  }
  const candidates = [
    path.join(process.resourcesPath, 'preload.cjs'),
    path.join(baseDir, 'preload.cjs'),
    path.join(baseDir, '..', 'preload.cjs'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  console.error('[CODEX] preload.cjs not found in any candidate path:', candidates);
  return candidates[0];
}

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
      sandbox: true,
    },
  });
  splash.loadFile(getPublicPath(isDev, baseDir, 'splash.html'));
  splash.on('closed', () => {});
  return splash;
}

// ── O2 Fix: Crash recovery with circular buffer ──
const MAX_CRASHES = 3;
const CRASH_WINDOW_MS = 60000;
const crashTimestamps = new Array(MAX_CRASHES).fill(0);
let crashIndex = 0;

function shouldAllowRecovery() {
  const now = Date.now();
  // Check if the oldest entry in the circular buffer is within the window
  const oldest = crashTimestamps[crashIndex];
  const tooMany = oldest > 0 && (now - oldest) < CRASH_WINDOW_MS;
  // Write current timestamp and advance index
  crashTimestamps[crashIndex] = now;
  crashIndex = (crashIndex + 1) % MAX_CRASHES;
  return !tooMany;
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
    frame: false,
    titleBarStyle: 'hidden',
    icon: getPublicPath(isDev, baseDir, 'icon.ico'),
    backgroundColor: '#0a1628',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: resolvePreloadPath(isDev, baseDir),
      webviewTag: false,
      spellcheck: false,
    },
  });

  // ── Window control IPC handlers ──
  const onMinimize = () => { if (!win.isDestroyed()) win.minimize(); };
  const onMaximize = () => {
    if (!win.isDestroyed()) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  };
  const onClose = () => { if (!win.isDestroyed()) win.close(); };
  ipcMain.on('window-minimize', onMinimize);
  ipcMain.on('window-maximize', onMaximize);
  ipcMain.on('window-close', onClose);
  ipcMain.handle('window-is-maximized', () => !win.isDestroyed() && win.isMaximized());

  // Notify renderer when maximize state changes
  win.on('maximize', () => { if (!win.isDestroyed()) win.webContents.send('window-maximized-changed', true); });
  win.on('unmaximize', () => { if (!win.isDestroyed()) win.webContents.send('window-maximized-changed', false); });

  onMainWindow(win);

  // ── DevTools in production for debugging ──
  if (!isDev && process.env.CODEX_DEBUG) {
    win.webContents.openDevTools();
  }

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
    win.loadURL('app://localhost/index.html').catch((err) => {
      logCrash('loadURL-app-protocol-failed', err);
      const indexPath = getDistPath(isDev, baseDir, 'index.html');
      win.loadFile(indexPath).catch((err2) => logCrash('loadFile-fallback-failed', err2));
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
          win.loadURL('app://localhost/index.html').catch(() => {
            win.loadFile(getDistPath(isDev, baseDir, 'index.html')).catch(() => {});
          });
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
        appReady = true;
        ipcMain.removeListener('window-minimize', onMinimize);
        ipcMain.removeListener('window-maximize', onMaximize);
        ipcMain.removeListener('window-close', onClose);
        try { ipcMain.removeHandler('window-is-maximized'); } catch (_) {}
        ipcMain.removeListener('renderer-ready', showWindow);
        clearTimeout(fallbackTimer);
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

  // ── G2 Fix: Removed confusing ready-to-show handler — renderer-ready + 6s fallback suffice ──
  const fallbackTimer = setTimeout(showWindow, 6000);

  // Cleanup IPC listeners on normal window close
  win.on('closed', () => {
    ipcMain.removeListener('window-minimize', onMinimize);
    ipcMain.removeListener('window-maximize', onMaximize);
    ipcMain.removeListener('window-close', onClose);
    try { ipcMain.removeHandler('window-is-maximized'); } catch (_) {}
    clearTimeout(fallbackTimer);
  });
}

module.exports = { createSplashWindow, createWindow };
