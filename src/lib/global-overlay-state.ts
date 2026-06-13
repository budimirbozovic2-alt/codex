/**
 * Helpers used by window-level keydown listeners to bail out cleanly when a
 * top-level overlay (Radix Dialog, GlobalSearch, …) is active or when the
 * event came from an editable surface.
 *
 * Previously this module exposed a mutable `setGlobalSearchOpen` flag. It was
 * removed because Radix Dialog now mounts the GlobalSearch as a real
 * `[role="dialog"][data-state="open"]` node — the DOM is the single source
 * of truth, no manual sync required.
 */

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"]')) return true;
  return false;
}

/** True when any Radix-style modal dialog is currently mounted and open. */
function isOverlayOpen(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector('[role="dialog"][data-state="open"]');
}

/** Composite guard: ignore the key event if any overlay is open OR the target is editable. */
export function shouldIgnoreGlobalKey(e: KeyboardEvent): boolean {
  return isOverlayOpen() || isEditableTarget(e.target);
}
