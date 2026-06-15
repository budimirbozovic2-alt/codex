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
