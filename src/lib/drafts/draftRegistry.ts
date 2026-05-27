/**
 * Centralized dirty-draft registry.
 *
 * `useDraftAutosave` instances report their key here when they enter / leave
 * the dirty state. UI layers (nav guards, route transitions, custom "discard
 * unsaved changes?" dialogs) subscribe to the snapshot to know whether to
 * block the action.
 *
 * In-process only — Pure Desktop runs as a single Electron window, so
 * cross-window draft sync is intentionally not implemented.
 */

type Listener = (dirtyKeys: ReadonlySet<string>) => void;

const dirtyKeys = new Set<string>();
const listeners = new Set<Listener>();

function notify(): void {
  const snapshot: ReadonlySet<string> = new Set(dirtyKeys);
  for (const l of listeners) {
    try { l(snapshot); } catch { /* listener errors must not break the registry */ }
  }
}

export const draftRegistry = {
  markDirty(key: string): void {
    if (dirtyKeys.has(key)) return;
    dirtyKeys.add(key);
    notify();
  },
  markClean(key: string): void {
    if (!dirtyKeys.has(key)) return;
    dirtyKeys.delete(key);
    notify();
  },
  isDirty(key: string): boolean {
    return dirtyKeys.has(key);
  },
  hasAnyDirty(): boolean {
    return dirtyKeys.size > 0;
  },
  snapshot(): ReadonlySet<string> {
    return new Set(dirtyKeys);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** Test-only reset. */
  _resetForTests(): void {
    dirtyKeys.clear();
    listeners.clear();
  },
};
