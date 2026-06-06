const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const MAX_BACKUPS = 3;
const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function defaultAssertTrustedSender() {
  throw new Error(
    'CRITICAL: assertTrustedSender must be explicitly injected by main.cjs.'
  );
}

function setupBackupSystem({ app, getMainWindow, logCrash, isDev, assertTrustedSender }) {
  const guard = assertTrustedSender || defaultAssertTrustedSender;
  const BACKUP_DIR = path.join(app.getPath('documents'), 'CodexBackups');
  const LAST_AUTO_BACKUP_PATH = path.join(app.getPath('userData'), 'last-auto-backup.json');

  async function ensureBackupDir() {
    try {
      await fsp.mkdir(BACKUP_DIR, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') logCrash('backup-mkdir', err);
    }
  }

  function formatBackupTimestamp(date = new Date()) {
    const pad = n => n.toString().padStart(2, '0');
    return `${date.getUTCFullYear()}_${pad(date.getUTCMonth() + 1)}_${pad(date.getUTCDate())}_${pad(date.getUTCHours())}_${pad(date.getUTCMinutes())}`;
  }

  function parseTimestampFromName(filename) {
    const match = filename.match(/Codex_AutoBackup_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})/);
    if (match) {
      return Date.UTC(
        parseInt(match[1], 10),
        parseInt(match[2], 10) - 1,
        parseInt(match[3], 10),
        parseInt(match[4], 10),
        parseInt(match[5], 10)
      );
    }
    return 0;
  }

  async function cleanOldBackups() {
    try {
      const entries = await fsp.readdir(BACKUP_DIR);
      const files = entries
        .filter(f => f.startsWith('Codex_AutoBackup_') && f.endsWith('.json'))
        .map(f => ({ name: f, time: parseTimestampFromName(f) }))
        .sort((a, b) => b.time - a.time);

      while (files.length > MAX_BACKUPS) {
        const old = files.pop();
        if (old) {
          try { 
            await fsp.unlink(path.join(BACKUP_DIR, old.name));
          } catch (err) {
            if (err.code !== 'ENOENT') logCrash('backup-cleanup-unlink', err);
          }
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') logCrash('backup-cleanup', err);
    }
  }

  async function getLastAutoBackupTime() {
    try {
      const raw = await fsp.readFile(LAST_AUTO_BACKUP_PATH, 'utf-8');
      const data = JSON.parse(raw);
      return data.timestamp || 0;
    } catch {
      return 0;
    }
  }

  async function setLastAutoBackupTime() {
    try {
      await fsp.writeFile(LAST_AUTO_BACKUP_PATH, JSON.stringify({ timestamp: Date.now() }));
    } catch (err) {
      logCrash('backup-timestamp-write', err);
    }
  }

  async function writeBackup(jsonString) {
    try {
      await ensureBackupDir();
      const filename = `Codex_AutoBackup_${formatBackupTimestamp()}.json`;
      await fsp.writeFile(path.join(BACKUP_DIR, filename), jsonString);
      
      await cleanOldBackups();
      await setLastAutoBackupTime();
      return true;
    } catch (err) {
      logCrash('backup-error', err);
      return false;
    }
  }

  async function shouldAutoBackup() {
    const last = await getLastAutoBackupTime();
    return (Date.now() - last) >= BACKUP_INTERVAL_MS;
  }

  async function performAutoBackup() {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!(await shouldAutoBackup())) return;
    mainWindow.webContents.send('backup-requested');
  }

  const MAX_BACKUP_BYTES = 200 * 1024 * 1024;
  const MAX_STREAM_BYTES = 500 * 1024 * 1024;
  
  let activeStreamPath = null;
  let activeStreamFile = null;
  let activeStreamBytes = 0;

  ipcMain.handle('backup-stream-start', async (event) => {
    guard(event);
    try {
      if (activeStreamFile || activeStreamPath) {
        if (activeStreamFile) { try { await activeStreamFile.close(); } catch (_) {} }
        if (activeStreamPath) { try { await fsp.unlink(activeStreamPath); } catch (_) {} }
        activeStreamFile = null;
        activeStreamPath = null;
      }

      await ensureBackupDir();
      const filename = `Codex_AutoBackup_${formatBackupTimestamp()}.json.tmp`;
      activeStreamPath = path.join(BACKUP_DIR, filename);
      activeStreamFile = await fsp.open(activeStreamPath, 'w');
      activeStreamBytes = 0; 
      
      return true;
    } catch (err) {
      logCrash('backup-stream-start-error', err);
      return false;
    }
  });

  ipcMain.handle('backup-stream-chunk', async (event, chunk) => {
    guard(event);
    if (!activeStreamFile) return false;
    
    try {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      
      activeStreamBytes += buf.length;
      if (activeStreamBytes > MAX_STREAM_BYTES) {
        await activeStreamFile.close();
        await fsp.unlink(activeStreamPath);
        activeStreamFile = null;
        activeStreamPath = null;
        logCrash('backup-stream-overflow', `Stream exceeded max size`);
        return false;
      }

      await activeStreamFile.appendFile(buf);
      return true;
    } catch (err) {
      logCrash('backup-stream-chunk-error', err);
      return false;
    }
  });

  ipcMain.handle('backup-stream-finish', async (event) => {
    guard(event);
    if (!activeStreamFile || !activeStreamPath) return false;
    try {
      await activeStreamFile.close();
      activeStreamFile = null;
      
      const finalPath = activeStreamPath.replace('.tmp', '');
      await fsp.rename(activeStreamPath, finalPath);
      activeStreamPath = null;
      activeStreamBytes = 0;

      await cleanOldBackups();
      await setLastAutoBackupTime();
      return true;
    } catch (err) {
      logCrash('backup-stream-finish-error', err);
      return false;
    }
  });

  ipcMain.handle('backup-stream-abort', async (event) => {
    guard(event);
    if (activeStreamFile) {
      try { await activeStreamFile.close(); } catch (_) {}
      activeStreamFile = null;
    }
    if (activeStreamPath) {
      try { await fsp.unlink(activeStreamPath); } catch (_) {}
      activeStreamPath = null;
    }
    activeStreamBytes = 0;
    return true;
  });

  ipcMain.handle('request-backup', async (event, jsonData) => {
    guard(event);
    if (typeof jsonData !== 'string' || jsonData.length <= 2) return false;
    if (jsonData.length > MAX_BACKUP_BYTES) {
      logCrash('backup-too-large', `Payload exceeds max backup bytes`);
      return false;
    }
    return writeBackup(jsonData);
  });

  ipcMain.handle('get-app-version', (event) => {
    guard(event);
    return app.getVersion();
  });

  ipcMain.handle('get-backup-info', async (event) => {
    guard(event);
    try {
      await ensureBackupDir();
      const entries = await fsp.readdir(BACKUP_DIR);
      const candidates = entries.filter(f => f.startsWith('Codex_AutoBackup_') && f.endsWith('.json'));
      
      const stats = await Promise.all(candidates.map(async (f) => {
        try {
          const stat = await fsp.stat(path.join(BACKUP_DIR, f));
          return { name: f, time: parseTimestampFromName(f), size: stat.size };
        } catch {
          return null;
        }
      }));
      
      const files = stats.filter(Boolean).sort((a, b) => b.time - a.time);
      const lastAutoBackup = await getLastAutoBackupTime();
      return { backupDir: BACKUP_DIR, files, lastAutoBackup };
    } catch {
      return { backupDir: BACKUP_DIR, files: [], lastAutoBackup: 0 };
    }
  });

  let backupInterval = null;
  if (!isDev) {
    setTimeout(() => {
      performAutoBackup();
      backupInterval = setInterval(performAutoBackup, 60 * 60 * 1000);
    }, 30 * 1000);
  }

  return {
    cleanup: () => { 
      if (backupInterval) clearInterval(backupInterval);
    },
    performBeforeQuitBackup: () => {
      const mainWindow = getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve();

      const QUIT_BACKUP_TIMEOUT = 5000;
      return new Promise(resolve => {
        let settled = false;
        let timeoutId = null;
        
        const handler = (event) => {
          try { guard(event); } catch { return; }
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
        } catch {
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