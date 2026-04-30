import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCardCRUD } from "@/hooks/useCardCRUD";
import { useCardAnnotations } from "@/hooks/useCardAnnotations";
import { useCardStateInternals } from "./CardStateProvider";

type CRUD = ReturnType<typeof useCardCRUD>;
type Annotations = ReturnType<typeof useCardAnnotations>;

export type CardActionsValue = CRUD & Annotations;

const CardActionsContext = createContext<CardActionsValue | null>(null);

export function useCardOnlyActions() {
  const ctx = useContext(CardActionsContext);
  if (!ctx) throw new Error("useCardOnlyActions must be used within CardActionsProvider");
  return ctx;
}

export function CardActionsProvider({ children }: { children: ReactNode }) {
  const { setCardMapState, cardMapRef, setReviewLog } = useCardStateInternals();

  const crud = useCardCRUD({ setCardMapState, cardMapRef });
  const annotations = useCardAnnotations({
    patchCard: crud.patchCard, setCardMapState, setReviewLog, cardMapRef,
  });

  // Sub-hooks already memoize each function with useCallback. Memoizing the
  // wrapper object keeps its identity stable across renders too.
  const value = useMemo<CardActionsValue>(
    () => ({ ...crud, ...annotations }),
    [
      crud.patchCard, crud.addCard, crud.addFlashCard, crud.updateCard,
      crud.deleteCard, crud.splitCard, crud.bulkAddCards,
      annotations.reviewSection, annotations.markRead, annotations.toggleTag,
      annotations.logError, annotations.clearErrorLog, annotations.addKeyPart,
      annotations.bulkFlagNeedsReview, annotations.bulkUpdateChapter,
    ],
  );

  return (
    <CardActionsContext.Provider value={value}>
      {children}
    </CardActionsContext.Provider>
  );
}
