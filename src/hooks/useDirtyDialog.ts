/**
 * `useDirtyDialog` — pair with any Radix `<Dialog>` whose body has unsaved
 * edits. When `isDirty` is true, calls to `tryClose(closer)` are intercepted:
 * instead of running `closer`, the hook flips `pendingClose` to true so the
 * caller can render `<DirtyConfirmBar>` in the dialog footer with three
 * resolutions (Discard / Keep editing / Save & close).
 *
 * Usage:
 *
 *   const { pendingClose, requestClose, cancelClose, confirmDiscard } =
 *     useDirtyDialog(isDirty, () => onOpenChange(false));
 *
 *   <DialogContent
 *     onPointerDownOutside={(e) => { if (isDirty) { e.preventDefault(); requestClose(); } }}
 *     onEscapeKeyDown={(e) => { if (isDirty) { e.preventDefault(); requestClose(); } }}
 *   >
 *     ...
 *     <DirtyConfirmBar
 *       open={pendingClose}
 *       onCancel={cancelClose}
 *       onDiscard={confirmDiscard}
 *       onSave={async () => { await save(); confirmDiscard(); }}
 *     />
 *   </DialogContent>
 *
 * The hook is intentionally state-only — it does not own the close itself, so
 * dialogs that need to run additional cleanup (focus return, form reset, …)
 * stay in control.
 */
import { useCallback, useState } from "react";

export interface DirtyDialogApi {
  /** True after `requestClose` is called while dirty; render the confirm bar. */
  pendingClose: boolean;
  /**
   * Ask to close. If the dialog is clean, runs the supplied closer immediately.
   * If dirty, sets `pendingClose=true` and lets the caller render the bar.
   */
  requestClose: () => void;
  /** Dismiss the confirm bar without closing the dialog. */
  cancelClose: () => void;
  /** Discard intent confirmed — runs the closer and clears the bar. */
  confirmDiscard: () => void;
}

export function useDirtyDialog(isDirty: boolean, close: () => void): DirtyDialogApi {
  const [pendingClose, setPendingClose] = useState(false);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setPendingClose(true);
    } else {
      close();
    }
  }, [isDirty, close]);

  const cancelClose = useCallback(() => {
    setPendingClose(false);
  }, []);

  const confirmDiscard = useCallback(() => {
    setPendingClose(false);
    close();
  }, [close]);

  return { pendingClose, requestClose, cancelClose, confirmDiscard };
}
