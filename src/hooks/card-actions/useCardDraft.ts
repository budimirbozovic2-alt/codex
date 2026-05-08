import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useCardDraftAutosave, loadCardDraft, buildDraftKey, type CardDraftSnapshot } from "../useCardDraftAutosave";

interface Props {
  editCardId: string | null | undefined;
  initialCategoryId: string;
  draftSnapshot: CardDraftSnapshot;
  applyDraft: (draft: CardDraftSnapshot) => void;
}

export function useCardDraft({ editCardId, initialCategoryId, draftSnapshot, applyDraft }: Props) {
  const initialCategoryIdRef = useRef<string>(initialCategoryId);
  const draftKey = useMemo(
    () => buildDraftKey(editCardId ?? null, initialCategoryIdRef.current),
    [editCardId],
  );

  const [pendingDraft, setPendingDraft] = useState<CardDraftSnapshot | null>(null);
  const [pendingDraftSavedAt, setPendingDraftSavedAt] = useState<number | null>(null);
  useEffect(() => {
    const stored = loadCardDraft(draftKey);
    if (stored) {
      setPendingDraft(stored);
      setPendingDraftSavedAt(stored.savedAt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Disable autosave while the restore banner is awaiting a decision so we
  // don't overwrite the stored draft with the empty initial form state.
  const autosaveEnabled = pendingDraft === null;
  const { clearDraft, flushDraft: _flushDraft } = useCardDraftAutosave(draftKey, draftSnapshot, autosaveEnabled);
  void _flushDraft;

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    applyDraft(pendingDraft);
    setPendingDraft(null);
    setPendingDraftSavedAt(null);
  }, [pendingDraft, applyDraft]);

  const dismissDraft = useCallback(() => {
    clearDraft();
    setPendingDraft(null);
    setPendingDraftSavedAt(null);
  }, [clearDraft]);

  return { pendingDraft, pendingDraftSavedAt, restoreDraft, dismissDraft, clearDraft };
}
