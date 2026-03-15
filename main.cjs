const { app, BrowserWindow } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

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

function createWindow(splash) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 670,
    show: false,
    icon: path.join(__dirname, 'public/icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:8080');
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
