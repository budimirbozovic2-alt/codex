const { app, BrowserWindow, Menu, globalShortcut } = require('electron');
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

app.whenReady().then(() => {
  const splash = createSplashWindow();
  createWindow(splash);
});

// ── Focus existing window if second instance attempted ──
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

} // end of gotLock else block
