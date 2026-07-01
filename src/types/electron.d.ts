// Electron renderer globals.
//
// The `ElectronAPI` surface (exposed via preload.cjs through contextBridge)
// lives in `electron-api.d.ts` as the single source of truth. This file only
// augments the global `Window` with the boot-trace hook so the two don't
// declare a conflicting `electronAPI` property.

interface Window {
  __bootTrace?: Array<{ step: string; ts: number; meta?: string }>;
}
