/**
 * `useDirtyDialog` — pair with any Radix `<Dialog>` whose body has unsaved
 * edits. When dirty, calls to `requestClose()` are intercepted: instead of
 * running `close`, the hook flips `pendingClose` to true so the caller can
 * render `<DirtyConfirmBar>` in the dialog footer with three resolutions
 * (Discard / Keep editing / Save & close).
 *
 * Two overloads:
 *   useDirtyDialog(isDirty: boolean, close: () => void)
 *   useDirtyDialog({ draftKey, close })  // reads draftRegistry by key
 *
 * The `draftKey` form removes the need to thread `isDirty` through props when
 * the editor already publishes to the registry (`useDraftAutosave`,
 * `useCardDraftAutosave`, `usePersistedDraftMirror`).
 */
import { useCallback, useState } from "react";
import { useIsDirty } from "./useDraftRegistry";

export interface DirtyDialogApi {
  pendingClose: boolean;
  requestClose: () => void;
  cancelClose: () => void;
  confirmDiscard: () => void;
}

interface KeyedOptions {
  draftKey: string | null | undefined;
  close: () => void;
}

export function useDirtyDialog(isDirty: boolean, close: () => void): DirtyDialogApi;
export function useDirtyDialog(opts: KeyedOptions): DirtyDialogApi;
export function useDirtyDialog(
  isDirtyOrOpts: boolean | KeyedOptions,
  closeMaybe?: () => void,
): DirtyDialogApi {
  const isObject = typeof isDirtyOrOpts === "object" && isDirtyOrOpts !== null;
  const draftKey = isObject ? isDirtyOrOpts.draftKey : null;
  const fromRegistry = useIsDirty(draftKey);
  const isDirty = isObject ? fromRegistry : isDirtyOrOpts;
  const close = isObject ? isDirtyOrOpts.close : (closeMaybe as () => void);

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
