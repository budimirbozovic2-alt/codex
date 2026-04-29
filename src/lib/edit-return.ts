/**
 * Edit-return context: when a card-edit is initiated from any view, the source
 * stashes (a) the absolute path to navigate back to and (b) an optional UI
 * snapshot to restore. EditPage consumes the path on cancel/save; the
 * destination view consumes the snapshot on mount.
 *
 * Two sessionStorage keys, by design:
 *   - sr-edit-return-context        → path + ts (consumed by EditPage)
 *   - sr-edit-return-context:state  → opaque snapshot (consumed by destination)
 *
 * This split lets EditPage clear navigation intent immediately while keeping
 * the snapshot alive across the route transition until the destination mounts.
 *
 * All snapshots SHOULD extend `BaseEditReturnSnapshot` so consumers get
 * uniform path/categoryId/cardId/scrollY validation via `useEditReturn`.
 */

const PATH_KEY = "sr-edit-return-context";
const STATE_KEY = "sr-edit-return-context:state";
const STALE_MS = 30 * 60 * 1000; // 30 minutes

interface StoredContext {
  path: string;
  ts: number;
}

interface StoredState<T> {
  data: T;
  ts: number;
}

/**
 * Standard snapshot shape every consumer must conform to. View-specific
 * extras are added via the generic parameter `S extends BaseEditReturnSnapshot`.
 */
export interface BaseEditReturnSnapshot {
  /** Absolute path the snapshot is bound to. Validated against current path on consume. */
  path: string;
  /** Vertical scroll position to restore. */
  scrollY?: number;
  /** Category UUID this snapshot belongs to (used for cross-category validation). */
  categoryId?: string;
  /** Card UUID being edited at stash time. */
  cardId?: string;
}

export function setEditReturn(ctx: { path: string }): void {
  try {
    const payload: StoredContext = { path: ctx.path, ts: Date.now() };
    sessionStorage.setItem(PATH_KEY, JSON.stringify(payload));
  } catch (e) {
    console.debug("[edit-return] setEditReturn failed", e);
  }
}

export function consumeEditReturn(): { path: string } | null {
  try {
    const raw = sessionStorage.getItem(PATH_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PATH_KEY);
    const parsed = JSON.parse(raw) as StoredContext;
    if (!parsed?.path || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > STALE_MS) return null;
    return { path: parsed.path };
  } catch (e) {
    console.debug("[edit-return] consumeEditReturn failed", e);
    return null;
  }
}

export function stashEditReturnState<T>(state: T): void {
  try {
    const payload: StoredState<T> = { data: state, ts: Date.now() };
    sessionStorage.setItem(STATE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.debug("[edit-return] stashEditReturnState failed", e);
  }
}

/**
 * Consume the stashed snapshot. Optional `validate` predicate lets callers
 * reject snapshots that don't match the current context (e.g. wrong path or
 * wrong categoryId). On reject the snapshot is still removed from storage
 * so it cannot leak into a later mount.
 */
export function consumeEditReturnState<T = unknown>(
  validate?: (snapshot: T) => boolean,
): T | null {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STATE_KEY);
    const parsed = JSON.parse(raw) as StoredState<T>;
    if (!parsed || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > STALE_MS) return null;
    if (validate && !validate(parsed.data)) return null;
    return parsed.data;
  } catch (e) {
    console.debug("[edit-return] consumeEditReturnState failed", e);
    return null;
  }
}
