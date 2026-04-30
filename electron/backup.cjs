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

  // ── O1 Fix: Parse timestamp from filename instead of statSync ──
  function parseTimestampFromName(filename) {
    // Format: Codex_AutoBackup_2026_04_13_12_30.json
    const match = filename.match(/Codex_AutoBackup_(\d{4}_\d{2}_\d{2}_\d{2}_\d{2})/);
    if (match) {
      const parts = match[1].split('_');
      return new Date(`${parts[0]}-${parts[1]}-${parts[2]}T${parts[3]}:${parts[4]}:00`).getTime() || 0;
    }
    return 0;
  }

  function cleanOldBackups() {
    try {
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('Codex_AutoBackup_') && f.endsWith('.json'))
        .map(f => ({ name: f, time: parseTimestampFromName(f) }))
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

  // ── B3 Fix: Async writeBackup ──
  async function writeBackup(jsonString) {
    try {
      ensureBackupDir();
      const now = new Date();
      const ts = now.toISOString().replace(/[-:T]/g, '_').slice(0, 15);
      const filename = `Codex_AutoBackup_${ts}.json`;
      await fs.promises.writeFile(path.join(BACKUP_DIR, filename), jsonString);
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
  const MAX_BACKUP_BYTES = 200 * 1024 * 1024; // I2: 200 MB cap
  ipcMain.handle('request-backup', async (_event, jsonData) => {
    if (typeof jsonData !== 'string' || jsonData.length <= 2) return false;
    if (jsonData.length > MAX_BACKUP_BYTES) {
      logCrash('backup-too-large', `Payload ${jsonData.length} bytes exceeds ${MAX_BACKUP_BYTES}`);
      return false;
    }
    return writeBackup(jsonData);
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
      if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve();

      const QUIT_BACKUP_TIMEOUT = 5000;
      // Symmetric cleanup: ensure both timeout and listener are released
      // exactly once whether the renderer responds in time or not.
      return new Promise(resolve => {
        let settled = false;
        let timeoutId = null;
        const handler = () => {
          if (settled) return;
          settled = true;
          if (timeoutId) clearTimeout(timeoutId);
          ipcMain.removeListener('quit-backup-done', handler);
          resolve(undefined);
        };
        ipcMain.once('quit-backup-done', handler);
        timeoutId = setTimeout(() => {
          if (settled) return;
          settled = true;
          ipcMain.removeListener('quit-backup-done', handler);
          resolve(undefined);
        }, QUIT_BACKUP_TIMEOUT);
        try {
          mainWindow.webContents.send('quit-backup-requested');
        } catch (err) {
          // If the renderer is already gone, settle immediately.
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            ipcMain.removeListener('quit-backup-done', handler);
            resolve(undefined);
          }
        }
      });
    },
  };
}

module.exports = { setupBackupSystem };
