/**
 * Source-Reader Actions Facade.
 *
 * Thin aggregator of 4 focused hooks (selection, mapping, editing, shortcuts).
 * Returns the same `{ contentRef, derived, actions }` shape that
 * `SourceReader.tsx` already consumes — no consumer changes needed.
 *
 * History: previously this hook was a 525-line monolith mixing DOM selection,
 * essay/payload construction, IDB writes, format/autosave, and shortcut
 * handling. Decomposed in line with the orchestrator architecture.
 */
import { useMemo } from "react";
import { useCardsByCategory } from "@/store/useCardSelectors";
import { useCardsBySource } from "@/store/useCardsBySource";
import { sanitizeHtml } from "@/lib/sanitize";
import type { Source } from "@/lib/sources-storage";
import { useSourceSelection } from "@/hooks/source-reader/useSourceSelection";
import { useSourceMapping } from "@/hooks/source-reader/useSourceMapping";
import { useSourceEditing } from "@/hooks/source-reader/useSourceEditing";
import { useSourceReaderShortcuts } from "@/hooks/source-reader/useSourceReaderShortcuts";

export function useSourceReaderActions(source: Source, onSourceUpdated?: (source: Source) => void) {
  // Phase 1 — granular selector: `derived.cards` previously pulled the
  // full library (~15k entries) so LinkToExistingCardModal could filter
  // by categoryId. Now we subscribe only to cards in this source's
  // category — the modal's filter narrows further by source/unlinked.
  // Cast to mutable Card[] for backward-compat with consumers; the array
  // is treated read-only downstream (modal only filters/maps).
  const cards = useCardsByCategory(source.categoryId) as unknown as import("@/lib/spaced-repetition").Card[];

  const sel = useSourceSelection();
  const mapping = useSourceMapping(source);
  const editing = useSourceEditing(source, sel.contentRef, onSourceUpdated);
  useSourceReaderShortcuts({ onConvertToEssay: mapping.handleConvertToEssay });

  const sourceCards = useCardsBySource(source.id);
  const safeHtml = useMemo(() => sanitizeHtml(source.htmlContent), [source.htmlContent]);

  return {
    contentRef: sel.contentRef,
    derived: { sourceCards, safeHtml, linkedCount: sourceCards.length, cards },
    actions: {
      handleMouseUp: sel.handleMouseUp,
      handleConvertToEssay: mapping.handleConvertToEssay,
      handleSmartSplitConfirm: mapping.handleSmartSplitConfirm,
      handleLinkToExisting: mapping.handleLinkToExisting,
      handleLinkConfirm: mapping.handleLinkConfirm,
      handleMapSelection: mapping.handleMapSelection,
      handleSetHeading: editing.handleSetHeading,
      handleFormatAsList: editing.handleFormatAsList,
      handleFormatSelectionAs: editing.handleFormatSelectionAs,
      handleContextMenu: editing.handleContextMenu,
      handleAutoFormatArticles: editing.handleAutoFormatArticles,
      handleEditInput: editing.handleEditInput,
      handleInlineFormat: editing.handleInlineFormat,
      scrollToHeading: editing.scrollToHeading,
    },
  };
}
