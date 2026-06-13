export type AppUpdateEvent =
  | { type: "available"; version: string; releaseNotes?: string | null; source?: "startup" | "manual" }
  | { type: "not-available"; version: string }
  | { type: "progress"; percent: number; transferred: number; total: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

export interface CheckForUpdatesResult {
  ok: boolean;
  hasUpdate?: boolean;
  version?: string | null;
  error?: string;
}

export interface ElectronAPI {
  requestBackup: (jsonData: string) => Promise<boolean>;
  backupStreamStart: () => Promise<unknown>;
  backupStreamChunk: (chunk: string) => Promise<unknown>;
  backupStreamFinish: () => Promise<unknown>;
  backupStreamAbort: () => Promise<unknown>;
  getAppVersion: () => Promise<string>;
  getBackupInfo: () => Promise<unknown>;
  notifyReady: () => void;
  onBackupRequested: (callback: () => void) => () => void;
  onQuitBackupRequested: (callback: () => void) => () => void;
  notifyQuitBackupDone: () => void;
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;
  windowIsMaximized: () => Promise<boolean>;
  onWindowMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void;
  isElectron: boolean;
  logError: (message: string) => Promise<boolean>;
  showSaveDialog: (options: unknown) => Promise<{ canceled: boolean; filePath?: string }>;
  showOpenDialog: (options: unknown) => Promise<{ canceled: boolean; filePaths: string[] }>;
  saveFile: (filePath: string, base64Data: string) => Promise<boolean>;
  readFile: (filePath: string) => Promise<{ data: string; name: string } | null>;
  saveFileBytes: (filePath: string, bytes: Uint8Array) => Promise<boolean>;
  readFileBytes: (filePath: string) => Promise<{ data: Uint8Array; name: string } | null>;
  checkForUpdates: () => Promise<CheckForUpdatesResult>;
  downloadUpdate: () => Promise<{ ok: boolean; error?: string }>;
  installUpdate: () => Promise<{ ok: boolean; error?: string }>;
  onAppUpdateEvent: (callback: (event: AppUpdateEvent) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
