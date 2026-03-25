const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, minimal API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Trigger a manual backup from renderer
  requestBackup: (jsonData) => ipcRenderer.invoke('request-backup', jsonData),
  // Get app paths
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // Get backup info (file list, last auto-backup time)
  getBackupInfo: () => ipcRenderer.invoke('get-backup-info'),
  // Notify main process that the app is ready (DB loaded)
  notifyReady: () => ipcRenderer.send('renderer-ready'),
  // Listen for backup-requested from main (e.g., periodic auto-backup)
  onBackupRequested: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('backup-requested', handler);
    return () => ipcRenderer.removeListener('backup-requested', handler);
  },
  // Listen for quit-backup-requested from main (before-quit with await)
  onQuitBackupRequested: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('quit-backup-requested', handler);
    return () => ipcRenderer.removeListener('quit-backup-requested', handler);
  },
  // Notify main that quit backup is done
  notifyQuitBackupDone: () => ipcRenderer.send('quit-backup-done'),
  // ── Window controls ──
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximizedChanged: (callback) => {
    const handler = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window-maximized-changed', handler);
    return () => ipcRenderer.removeListener('window-maximized-changed', handler);
  },
  // Check if running in Electron
  isElectron: true,
});
