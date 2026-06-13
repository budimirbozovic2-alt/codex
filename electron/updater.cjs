const { ipcMain, app } = require('electron');
const { autoUpdater } = require('electron-updater');

/**
 * GitHub Releases auto-update (electron-updater).
 * Active only in packaged builds — dev returns a clear error from IPC.
 */
function setupUpdater({ isDev, getMainWindow, assertTrustedSender, logCrash }) {
  const guard = assertTrustedSender;

  if (isDev) {
    ipcMain.handle('app-check-for-updates', (event) => {
      guard(event);
      return { ok: false, error: 'Ažuriranja nisu dostupna u razvojnom modu.' };
    });
    ipcMain.handle('app-download-update', (event) => {
      guard(event);
      return { ok: false, error: 'Ažuriranja nisu dostupna u razvojnom modu.' };
    });
    ipcMain.handle('app-install-update', (event) => {
      guard(event);
      return { ok: false, error: 'Ažuriranja nisu dostupna u razvojnom modu.' };
    });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  /** Distinguish startup vs manual checks for toast UX in renderer. */
  let pendingCheckSource = 'startup';

  const send = (payload) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('app-update-event', payload);
    }
  };

  autoUpdater.on('update-available', (info) => {
    send({
      type: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
      source: pendingCheckSource,
    });
    pendingCheckSource = 'startup';
  });

  autoUpdater.on('update-not-available', (info) => {
    send({ type: 'not-available', version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    send({
      type: 'progress',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    send({ type: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    logCrash('auto-updater', err);
    send({ type: 'error', message: err?.message || String(err) });
  });

  ipcMain.handle('app-check-for-updates', async (event) => {
    guard(event);
    pendingCheckSource = 'manual';
    try {
      const result = await autoUpdater.checkForUpdates();
      const remoteVersion = result?.updateInfo?.version ?? null;
      const hasUpdate = !!remoteVersion && remoteVersion !== app.getVersion();
      return { ok: true, hasUpdate, version: remoteVersion };
    } catch (err) {
      logCrash('app-check-for-updates', err);
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('app-download-update', async (event) => {
    guard(event);
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      logCrash('app-download-update', err);
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('app-install-update', (event) => {
    guard(event);
    try {
      autoUpdater.quitAndInstall(false, true);
      return { ok: true };
    } catch (err) {
      logCrash('app-install-update', err);
      return { ok: false, error: err?.message || String(err) };
    }
  });

  // Silent check ~30s after launch; UI reacts via events if an update exists.
  setTimeout(() => {
    pendingCheckSource = 'startup';
    autoUpdater.checkForUpdates().catch((err) => logCrash('auto-updater-startup', err));
  }, 30_000);
}

module.exports = { setupUpdater };
