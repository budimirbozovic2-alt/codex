// Electron API type declarations for the renderer process
// Exposed via preload.cjs through contextBridge

export interface ElectronAPI {
  requestBackup: (jsonData: string) => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  notifyReady: () => void;
  onBackupRequested: (callback: () => void) => () => void;
  isElectron: true;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
