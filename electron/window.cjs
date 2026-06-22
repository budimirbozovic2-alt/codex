const { BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

function resolvePreloadPath(isDev, baseDir) {
  if (isDev) return path.join(baseDir, 'preload.cjs');
  const prodPath = path.join(process.resourcesPath, 'preload.cjs');
  if (fs.existsSync(prodPath)) return prodPath;
  return path.join(baseDir, 'preload.cjs');
}

function getDistPath(isDev, baseDir, ...segments) {
  return isDev 
    ? path.join(baseDir, ...segments)
    : path.join(baseDir, 'dist', ...segments);
}

function getPublicPath(isDev, baseDir, ...segments) {
  return isDev 
    ? path.join(baseDir, 'public', ...segments)
    : path.join(baseDir, 'dist', ...segments);
}

async function loadWindowState(configPath) {
  try {
    const raw = await fsp.readFile(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { width: 1200, height: 800 };
  }
}

async function saveWindowState(win, configPath) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  try {
    await fsp.writeFile(configPath, JSON.stringify({
      x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    }));
  } catch (_) {} 
}

function createSplashWindow(isDev, baseDir) {
  const splash = new BrowserWindow({
    width: 480,
    height: 360,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    icon: getPublicPath(isDev, baseDir, 'app-icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  splash.loadFile(getPublicPath(isDev, baseDir, 'splash.html'));
  return splash;
}

function defaultAssertTrustedSender() {
  throw new Error('CRITICAL: assertTrustedSender must be explicitly injected.');
}

const MAX_CRASHES = 3;
const CRASH_WINDOW_MS = 60000;
const crashTimestamps = new Array(MAX_CRASHES).fill(0);
let crashIndex = 0;

function shouldAllowRecovery() {
  const now = Date.now();
  const oldest = crashTimestamps[crashIndex];
  const tooMany = oldest > 0 && (now - oldest) < CRASH_WINDOW_MS;
  crashTimestamps[crashIndex] = now;
  crashIndex = (crashIndex + 1) % MAX_CRASHES;
  return !tooMany;
}

let currentReadyToken = Symbol();

async function createWindow({ isDev, baseDir, configPath, logCrash, splash, onMainWindow, assertTrustedSender }) {
  const guard = assertTrustedSender || defaultAssertTrustedSender;
  const saved = await loadWindowState(configPath);

  const windowToken = Symbol();
  currentReadyToken = windowToken;

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
    icon: getPublicPath(isDev, baseDir, 'app-icon.ico'),
    backgroundColor: '#0a1628',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: resolvePreloadPath(isDev, baseDir),
      webviewTag: false,
      spellcheck: false,
      devTools: isDev,
    },
  });

  const onMinimize = (event) => { try { guard(event); } catch { return; } if (!win.isDestroyed()) win.minimize(); };
  const onMaximize = (event) => {
    try { guard(event); } catch { return; }
    if (!win.isDestroyed()) { win.isMaximized() ? win.unmaximize() : win.maximize(); }
  };
  const onClose = (event) => { try { guard(event); } catch { return; } if (!win.isDestroyed()) win.close(); };

  ipcMain.on('window-minimize', onMinimize);
  ipcMain.on('window-maximize', onMaximize);
  ipcMain.on('window-close', onClose);
  
  ipcMain.removeHandler('window-is-maximized');
  ipcMain.handle('window-is-maximized', (event) => {
    guard(event);
    return !win.isDestroyed() && win.isMaximized();
  });

  win.on('maximize', () => { if (!win.isDestroyed()) win.webContents.send('window-maximized-changed', true); });
  win.on('unmaximize', () => { if (!win.isDestroyed()) win.webContents.send('window-maximized-changed', false); });

  onMainWindow(win);

  if (isDev) {
    win.webContents.on('before-input-event', (event, input) => {
      const key = input.key.toLowerCase();
      const toggleDevTools =
        key === 'f12' ||
        (input.control && input.shift && key === 'i');
      if (!toggleDevTools) return;
      if (win.isDestroyed()) return;
      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools();
      } else {
        win.webContents.openDevTools({ mode: 'detach' });
      }
      event.preventDefault();
    });
  } else {
    Menu.setApplicationMenu(null);
    win.webContents.on('before-input-event', (event, input) => {
      const key = input.key.toLowerCase();
      const devToolsShortcut =
        key === 'f12' ||
        (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c')) ||
        (input.meta && input.alt && key === 'i');
      if (
        devToolsShortcut ||
        (input.control && key === 'r') ||
        key === 'f5'
      ) {
        event.preventDefault();
      }
    });
    win.webContents.on('devtools-opened', () => {
      if (!win.isDestroyed()) win.webContents.closeDevTools();
    });
    win.webContents.closeDevTools();
  }

  const devServerUrl = `http://localhost:${parseInt(process.env.VITE_DEV_SERVER_PORT || '8080', 10)}`;
  if (isDev) {
    win.loadURL(devServerUrl);
  } else {
    win.loadURL('app://localhost/index.html').catch((err) => {
      logCrash('loadURL-app-protocol-failed', err);
      const indexPath = getDistPath(isDev, baseDir, 'index.html');
      win.loadFile(indexPath).catch((err2) => logCrash('loadFile-fallback-failed', err2));
    });
  }

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logCrash('did-fail-load', `${errorCode}: ${errorDescription} @ ${validatedURL}`);
    setTimeout(() => {
      if (!win.isDestroyed()) {
        isDev ? win.loadURL(devServerUrl) : win.loadURL('app://localhost/index.html').catch(() => win.loadFile(getDistPath(isDev, baseDir, 'index.html')).catch(() => {}));
      }
    }, 2000);
  });

  let appReady = false;

  const showWindow = (event, { fromFallback = false } = {}) => {
    if (currentReadyToken !== windowToken) return;
    if (event) { try { guard(event); } catch { return; } }
    if (appReady) return;
    appReady = true;

    if (splash && !splash.isDestroyed()) splash.destroy();

    if (!win.isDestroyed()) {
      // When the fallback fires the renderer hasn't called notifyElectronReady()
      // yet, so #app-splash was never cleaned up. Remove it before the window
      // becomes visible to avoid showing the HTML splash over the loaded UI.
      if (fromFallback) {
        win.webContents.executeJavaScript(
          'try { var s = document.getElementById("app-splash"); if (s) s.remove(); } catch(_){}'
        ).catch(() => {});
      }
      win.show();
    }
  };

  ipcMain.removeListener('renderer-ready', showWindow);
  ipcMain.once('renderer-ready', showWindow);
  const fallbackTimer = setTimeout(() => showWindow(null, { fromFallback: true }), 6000);

  win.webContents.on('render-process-gone', (_event, details) => {
    logCrash('render-process-gone', JSON.stringify(details));
    if (!win.isDestroyed()) {
      ipcMain.removeListener('window-minimize', onMinimize);
      ipcMain.removeListener('window-maximize', onMaximize);
      ipcMain.removeListener('window-close', onClose);
      ipcMain.removeHandler('window-is-maximized');
      clearTimeout(fallbackTimer);
      
      currentReadyToken = Symbol();
      
      if (shouldAllowRecovery()) {
        win.destroy();
        const newSplash = createSplashWindow(isDev, baseDir);
        createWindow({ isDev, baseDir, configPath, logCrash, splash: newSplash, onMainWindow, assertTrustedSender });
      } else {
        logCrash('crash-loop-detected', 'Too many crashes');
        const { dialog } = require('electron');
        dialog.showErrorBox(
          `Aplikacija se neprestano rusi`,
          `Sistem je prijavio previse neocekivanih padova baze u kratkom roku. Aplikacija mora da se zatvori kako bi sprijecila ostecenje podataka.`
        );
        win.destroy();
        require('electron').app.quit();
      }
    }
  });

  win.webContents.on('unresponsive', () => {
    logCrash('unresponsive', 'Window became unresponsive');
  });

  let saveTimeout = null;
  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => { saveWindowState(win, configPath); }, 500);
  };
  win.on('resize', debouncedSave);
  win.on('move', debouncedSave);

  win.on('closed', () => {
    ipcMain.removeListener('window-minimize', onMinimize);
    ipcMain.removeListener('window-maximize', onMaximize);
    ipcMain.removeListener('window-close', onClose);
    try { ipcMain.removeHandler('window-is-maximized'); } catch (_) {}
    clearTimeout(fallbackTimer);
  });
}

module.exports = { createSplashWindow, createWindow };