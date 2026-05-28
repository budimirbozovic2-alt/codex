/**
 * View Transitions API wrapper with feature-detect fallback.
 *
 * Pilot ("No more empty blinks") — see .lovable/plan.md.
 *
 * Calls `document.startViewTransition(fn)` when supported (Chromium ≥111,
 * which covers all currently-shipped Electron versions of this app). Falls
 * back to running `fn` synchronously when unsupported (e.g. older Electron,
 * jsdom in tests).
 *
 * The wrapper is intentionally narrow: it never throws, never returns a
 * promise the caller has to await, and never logs. Cross-fade timing lives
 * in `index.css` under `::view-transition-old/new(*)`.
 */

type ViewTransitionCapableDoc = Document & {
  startViewTransition?: (cb: () => void) => unknown;
};

export function startViewTransition(fn: () => void): void {
  if (typeof document === "undefined") {
    fn();
    return;
  }
  const doc = document as ViewTransitionCapableDoc;
  const start = doc.startViewTransition;
  if (typeof start !== "function") {
    fn();
    return;
  }
  try {
    start.call(doc, fn);
  } catch {
    // Defensive: never let a transition glitch break a state update.
    fn();
  }
}
