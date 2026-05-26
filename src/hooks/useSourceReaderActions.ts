/**
 * Source-Reader Actions Facade (PR-7a).
 *
 * After the BubbleMenu migration this facade is just a thin adapter around
 * `useSourceMapping` + `useSourceEditing` + `useSourceReaderShortcuts`. There
 * is no DOM-selection tracking left — all selection lives inside TipTap.
 */
import { useMemo } from "react";
import { useCardsByCategory, useCardsBySource } from "@/store";
import type { Source } from "@/lib/sources-storage";
import { useSourceMapping } from "@/hooks/source-reader/useSourceMapping";
import { useSourceEditing } from "@/hooks/source-reader/useSourceEditing";
import { useSourceReaderShortcuts } from "@/hooks/source-reader/useSourceReaderShortcuts";

export function useSourceReaderActions(source: Source, onSourceUpdated?: (source: Source) => void) {
  const cards = useCardsByCategory(source.categoryId) as unknown as import("@/lib/spaced-repetition").Card[];

  const mapping = useSourceMapping(source);
  const editing = useSourceEditing(source, onSourceUpdated);

  // Convert-to-essay shortcut (S key) only fires if a selection payload is
  // available — the parent wires this via `setShortcutHandler` once mounted.
  useSourceReaderShortcuts({ onConvertToEssay: () => { /* wired in SourceReader */ } });

  const sourceCards = useCardsBySource(source.id);

  return useMemo(() => ({
    derived: { sourceCards, linkedCount: sourceCards.length, cards },
    actions: {
      handleConvertToEssay: mapping.handleConvertToEssay,
      handleSmartSplitConfirm: mapping.handleSmartSplitConfirm,
      handleLinkToExisting: mapping.handleLinkToExisting,
      handleLinkConfirm: mapping.handleLinkConfirm,
      handleMapSelection: mapping.handleMapSelection,
      handleAutoFormatArticles: editing.handleAutoFormatArticles,
      scrollToHeading: editing.scrollToHeading,
    },
  }), [sourceCards, cards, mapping, editing]);
}
