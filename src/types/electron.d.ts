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
  /** Future-proof channel — preferred over onQuitBackupRequested when available. */
  onBeforeQuit?: (callback: () => void | Promise<void>) => () => void;
  // Window controls
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;
  windowIsMaximized: () => Promise<boolean>;
  onWindowMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void;
  isElectron: true;
  logError: (message: string) => Promise<boolean>;
  // Native file dialogs
  showSaveDialog: (options: Record<string, unknown>) => Promise<{ canceled: boolean; filePath?: string }>;
  showOpenDialog: (options: Record<string, unknown>) => Promise<{ canceled: boolean; filePaths: string[] }>;
  saveFile: (filePath: string, base64Data: string) => Promise<boolean>;
  readFile: (filePath: string) => Promise<{ data: string; name: string } | null>;
}

interface Window {
  electronAPI?: ElectronAPI;
  __bootTrace?: Array<{ step: string; ts: number; meta?: string }>;
}
