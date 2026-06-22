import { create } from "zustand";

export type SourceContentSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface SourceContentSaveState {
  status: SourceContentSaveStatus;
  isDirty: boolean;
  setStatus: (status: SourceContentSaveStatus) => void;
  setDirty: (dirty: boolean) => void;
  reset: () => void;
}

export const useSourceContentSaveStore = create<SourceContentSaveState>((set) => ({
  status: "idle",
  isDirty: false,
  setStatus: (status) => set({ status }),
  setDirty: (isDirty) => set({ isDirty, status: isDirty ? "dirty" : "idle" }),
  reset: () => set({ status: "idle", isDirty: false }),
}));

export function getSourceContentDirty(): boolean {
  return useSourceContentSaveStore.getState().isDirty;
}

export function resetSourceContentSave(): void {
  useSourceContentSaveStore.getState().reset();
}

let flushHandler: (() => Promise<boolean>) | null = null;

/** Registered by `SourceContent` while mounted. */
export function registerSourceContentFlush(fn: () => Promise<boolean>): () => void {
  flushHandler = fn;
  return () => {
    if (flushHandler === fn) flushHandler = null;
  };
}

/** Flush pending debounced save and wait for completion. Returns true when clean. */
export async function flushSourceContentSave(): Promise<boolean> {
  if (!flushHandler) return !getSourceContentDirty();
  return flushHandler();
}
