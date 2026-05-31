import { useEffect } from "react";
import { isEditableTarget } from "@/lib/global-overlay-state";

/**
 * Lightweight window-level keydown subscription.
 *
 * Replaces the repeated `useEffect(() => { window.addEventListener("keydown", ...) })`
 * pattern across components. Pass a `matcher` to filter the event and a
 * `handler` to react. `ignoreInEditable` swallows events fired from input/
 * textarea/contenteditable surfaces (default false to preserve existing
 * behaviour where call sites opt in).
 */
export function useGlobalHotkey(
  matcher: (e: KeyboardEvent) => boolean,
  handler: (e: KeyboardEvent) => void,
  deps: ReadonlyArray<unknown> = [],
  opts: { capture?: boolean; ignoreInEditable?: boolean } = {},
): void {
  const { capture = false, ignoreInEditable = false } = opts;
  useEffect(() => {
    const cb = (e: KeyboardEvent) => {
      if (ignoreInEditable && isEditableTarget(e.target)) return;
      if (matcher(e)) handler(e);
    };
    window.addEventListener("keydown", cb, capture);
    return () => window.removeEventListener("keydown", cb, capture);
    // Reason: `deps` is the caller-supplied dep list; matcher/handler are read at
    // dispatch time inside the listener so they don't belong in the rebind deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
