const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const MAX_BACKUPS = 3;
const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function setupBackupSystem({ app, getMainWindow, logCrash, isDev }) {
  const BACKUP_DIR = path.join(app.getPath('documents'), 'CodexBackups');
  const LAST_AUTO_BACKUP_PATH = path.join(app.getPath('userData'), 'last-auto-backup.json');

  function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  }

  function cleanOldBackups() {
    try {
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('Codex_AutoBackup_') && f.endsWith('.json'))
        .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);
      while (files.length > MAX_BACKUPS) {
        const old = files.pop();
        if (old) fs.unlinkSync(path.join(BACKUP_DIR, old.name));
      }
    } catch (_) {}
  }

  function getLastAutoBackupTime() {
    try {
      if (fs.existsSync(LAST_AUTO_BACKUP_PATH)) {
        const data = JSON.parse(fs.readFileSync(LAST_AUTO_BACKUP_PATH, 'utf-8'));
        return data.timestamp || 0;
      }
    } catch (_) {}
    return 0;
  }

  function setLastAutoBackupTime() {
    try {
      fs.writeFileSync(LAST_AUTO_BACKUP_PATH, JSON.stringify({ timestamp: Date.now() }));
    } catch (_) {}
  }

  function writeBackup(jsonString) {
    try {
      ensureBackupDir();
      const now = new Date();
      const ts = now.toISOString().replace(/[-:T]/g, '_').slice(0, 15);
      const filename = `Codex_AutoBackup_${ts}.json`;
      fs.writeFileSync(path.join(BACKUP_DIR, filename), jsonString);
      cleanOldBackups();
      setLastAutoBackupTime();
      return true;
    } catch (err) {
      logCrash('backup-error', err);
      return false;
    }
  }

  function shouldAutoBackup() {
    const last = getLastAutoBackupTime();
    return (Date.now() - last) >= BACKUP_INTERVAL_MS;
  }

  function performAutoBackup() {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!shouldAutoBackup()) return;
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

  ipcMain.handle('get-backup-info', () => {
    try {
      ensureBackupDir();
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('Codex_AutoBackup_') && f.endsWith('.json'))
        .map(f => {
          const stat = fs.statSync(path.join(BACKUP_DIR, f));
          return { name: f, time: stat.mtimeMs, size: stat.size };
        })
        .sort((a, b) => b.time - a.time);
      return { backupDir: BACKUP_DIR, files, lastAutoBackup: getLastAutoBackupTime() };
    } catch (_) {
      return { backupDir: BACKUP_DIR, files: [], lastAutoBackup: 0 };
    }
  });

  // Start auto-backup schedule
  let backupInterval = null;
  if (!isDev) {
    setTimeout(() => {
      performAutoBackup();
      backupInterval = setInterval(performAutoBackup, 60 * 60 * 1000);
    }, 30 * 1000);
  }

  return {
    cleanup: () => { if (backupInterval) clearInterval(backupInterval); },
    performBeforeQuitBackup: () => {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Use invoke pattern with timeout so we wait for backup to finish
        const QUIT_BACKUP_TIMEOUT = 5000;
        return Promise.race([
          mainWindow.webContents.executeJavaScript(
            `window.__backupBeforeQuit ? window.__backupBeforeQuit() : Promise.resolve()`
          ).catch(() => {}),
          new Promise(resolve => setTimeout(resolve, QUIT_BACKUP_TIMEOUT)),
        ]);
      }
      return Promise.resolve();
    },
  };
}

module.exports = { setupBackupSystem };
