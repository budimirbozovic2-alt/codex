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

interface UIState {
  editingCardId: string | null;
}

export const uiStore = create<UIState>(() => ({
  editingCardId: null,
}));

/** Sync read for non-React callers (e.g. `useEditReturn` stash path). */
export function getCurrentEditingCardId(): string | null {
  return uiStore.getState().editingCardId;
}

/** Module-level setter — usable from tests AND from the React-bound hook. */
export function setEditingCardId(id: string | null): void {
  uiStore.setState({ editingCardId: id });
}
