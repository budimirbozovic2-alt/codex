const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, minimal API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Trigger a manual backup from renderer
  requestBackup: (jsonData) => ipcRenderer.invoke('request-backup', jsonData),
  // Get app paths
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // Notify main process that the app is ready (DB loaded)
  notifyReady: () => ipcRenderer.send('renderer-ready'),
  // Listen for backup-requested from main (e.g., before quit)
  onBackupRequested: (callback) => {
    ipcRenderer.on('backup-requested', () => callback());
    return () => ipcRenderer.removeAllListeners('backup-requested');
  },
  // Check if running in Electron
  isElectron: true,
});
