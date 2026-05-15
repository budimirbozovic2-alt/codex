import { useCallback, useMemo } from "react";
import {
  createEmptyModule,
  htmlToPlain,
  joinHtmlBlocks,
  splitHtmlIntoBlocks,
  type SelectionModule,
} from "@/lib/selection-split-engine";
import { defaultEdit } from "@/lib/split-wizard-build";
import { useSourceReaderStore } from "@/store/useSourceReaderStore";

type EditDraft = ReturnType<typeof defaultEdit>;

/**
 * Orchestrates the Smart-Split wizard's module list mutations:
 *   - reorder / add / remove
 *   - per-module patch + per-edit patch
 *   - manual mid-module cut (split content at a block boundary)
 *
 * Pure orchestration over the SourceReader zustand store — UI components
 * just consume the returned callbacks. Splitting commit logic out of the
 * 601-line dialog made the renderer drop to ~250 lines.
 */
export function useSplitModules() {
  const splitModules = useSourceReaderStore((s) => s.splitModules);
  const splitEdits = useSourceReaderStore((s) => s.splitEdits);
  const setSplitModules = useSourceReaderStore((s) => s.setSplitModules);
  const setSplitEdits = useSourceReaderStore((s) => s.setSplitEdits);

  const total = splitModules.length;
  const keptCount = useMemo(
    () => splitEdits.filter((e) => !e.skipped).length,
    [splitEdits],
  );

  const updateModule = useCallback(
    (i: number, patch: Partial<SelectionModule>) => {
      setSplitModules((prev) => prev.map((m, j) => (j === i ? { ...m, ...patch } : m)));
    },
    [setSplitModules],
  );

  const updateEditAt = useCallback(
    (i: number, patch: Partial<EditDraft>) => {
      setSplitEdits((prev) => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));
    },
    [setSplitEdits],
  );

  const addNewModule = useCallback(() => {
    const fresh = createEmptyModule(`Novi modul ${total + 1}`);
    setSplitModules((prev) => [...prev, fresh]);
    setSplitEdits((prev) => [...prev, defaultEdit(fresh)]);
  }, [total, setSplitModules, setSplitEdits]);

  const deleteModule = useCallback(
    (i: number) => {
      if (total <= 1) return;
      setSplitModules((prev) => prev.filter((_, j) => j !== i));
      setSplitEdits((prev) => prev.filter((_, j) => j !== i));
    },
    [total, setSplitModules, setSplitEdits],
  );

  const moveModule = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= total || from === to) return;
      setSplitModules((prev) => {
        const arr = [...prev];
        const [it] = arr.splice(from, 1);
        arr.splice(to, 0, it);
        return arr;
      });
      setSplitEdits((prev) => {
        const arr = [...prev];
        const [it] = arr.splice(from, 1);
        arr.splice(to, 0, it);
        return arr;
      });
    },
    [total, setSplitModules, setSplitEdits],
  );

  /**
   * Manual cut: splits module `moduleIdx` at block boundary `blockIdx`.
   * The clicked block becomes the new module's TITLE; the body uses
   * everything AFTER it, so the title isn't duplicated.
   */
  const performManualCut = useCallback(
    (moduleIdx: number, blockIdx: number): boolean => {
      const mod = splitModules[moduleIdx];
      if (!mod) return false;
      const blocks = splitHtmlIntoBlocks(mod.contentHtml);
      if (blockIdx <= 0 || blockIdx >= blocks.length) return false;

      const beforeHtml = joinHtmlBlocks(blocks.slice(0, blockIdx));
      const titleBlock = blocks[blockIdx];
      const afterHtml = joinHtmlBlocks(blocks.slice(blockIdx + 1));
      const newTitle =
        htmlToPlain(titleBlock).replace(/\s+/g, " ").trim().slice(0, 200) || "Novi modul";

      const newModule: SelectionModule = {
        articleNum: "",
        title: newTitle,
        contentText: htmlToPlain(afterHtml),
        contentHtml: afterHtml,
        plainSnippet: htmlToPlain(afterHtml).trim() || newTitle,
      };

      setSplitModules((prev) => {
        const out = [...prev];
        out[moduleIdx] = {
          ...out[moduleIdx],
          contentText: htmlToPlain(beforeHtml),
          contentHtml: beforeHtml,
          plainSnippet: htmlToPlain(beforeHtml).trim() || out[moduleIdx].title,
        };
        out.splice(moduleIdx + 1, 0, newModule);
        return out;
      });
      setSplitEdits((prev) => {
        const out = [...prev];
        out.splice(moduleIdx + 1, 0, defaultEdit(newModule));
        return out;
      });
      return true;
    },
    [splitModules, setSplitModules, setSplitEdits],
  );

  return {
    splitModules, splitEdits,
    total, keptCount,
    updateModule, updateEditAt,
    addNewModule, deleteModule, moveModule,
    performManualCut,
  };
}
