/**
 * Source-Reader Actions Facade (PR-7a).
 *
 * After the BubbleMenu migration this facade is just a thin adapter around
 * `useSourceMapping` + `useSourceEditing`. Keyboard shortcuts are registered
 * in `SourceReader` where the live TipTap editor selection is available.
 */
import { useMemo } from "react";
import type { Source } from "@/domains/sources/sources-storage";
import { useSourceMapping } from "@/hooks/source-reader/useSourceMapping";
import { useSourceEditing } from "@/hooks/source-reader/useSourceEditing";

export function useSourceReaderActions(source: Source, onSourceUpdated?: (source: Source) => void) {
  const mapping = useSourceMapping(source);
  const editing = useSourceEditing(source, onSourceUpdated);

  return useMemo(() => ({
    actions: {
      handleConvertToEssay: mapping.handleConvertToEssay,
      handleSmartSplitConfirm: mapping.handleSmartSplitConfirm,
      handleLinkToExisting: mapping.handleLinkToExisting,
      handleLinkConfirm: mapping.handleLinkConfirm,
      handleMapSelection: mapping.handleMapSelection,
      handleAutoFormatArticles: editing.handleAutoFormatArticles,
      handleAutoFormatLegalProvisions: editing.handleAutoFormatLegalProvisions,
      scrollToHeading: editing.scrollToHeading,
    },
  }), [mapping, editing]);
}
