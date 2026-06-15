// ─────────────────────────────────────────────────────────────────────────────
// useUIStore — Zustand atom for transient UI state previously held in
// `UIProvider`.
//
// Currently holds only `editingCardId` (UUID-only edit target — EditPage
// resolves the live Card from the card map). The store doubles as the SSOT
// mirror that `useEditReturn` consults synchronously, so the parallel
// module-level slot from the old provider is eliminated.
// ─────────────────────────────────────────────────────────────────────────────
import { create } from "zustand";

export interface TitleBarContext {
  /** Primary segment (e.g. category or screen name). */
  label: string;
  /** Optional detail (e.g. open source title in reader). */
  detail?: string;
}

interface UIState {
  editingCardId: string | null;
  /** Hides app sidebar + header for immersive reading/study surfaces. */
  immersiveMode: boolean;
  /** Electron title bar override — set by immersive surfaces (reader, etc.). */
  titleBarContext: TitleBarContext | null;
}

export const uiStore = create<UIState>(() => ({
  editingCardId: null,
  immersiveMode: false,
  titleBarContext: null,
}));

/** Sync read for non-React callers (e.g. `useEditReturn` stash path). */
export function getCurrentEditingCardId(): string | null {
  return uiStore.getState().editingCardId;
}

/** Module-level setter — usable from tests AND from the React-bound hook. */
export function setEditingCardId(id: string | null): void {
  uiStore.setState({ editingCardId: id });
}

export function setImmersiveMode(active: boolean): void {
  uiStore.setState({ immersiveMode: active });
}

export function getImmersiveMode(): boolean {
  return uiStore.getState().immersiveMode;
}

export function setTitleBarContext(context: TitleBarContext | null): void {
  uiStore.setState({ titleBarContext: context });
}
