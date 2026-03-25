// Electron API type declarations for the renderer process
// Exposed via preload.cjs through contextBridge

interface BackupInfo {
  backupDir: string;
  files: { name: string; time: number; size: number }[];
  lastAutoBackup: number;
}

interface ElectronAPI {
  requestBackup: (jsonData: string) => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  getBackupInfo: () => Promise<BackupInfo>;
  notifyReady: () => void;
  onBackupRequested: (callback: () => void) => () => void;
  onQuitBackupRequested: (callback: () => void) => () => void;
  notifyQuitBackupDone: () => void;
  isElectron: true;
}

interface Window {
  electronAPI?: ElectronAPI;
}
