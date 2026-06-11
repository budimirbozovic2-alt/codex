import { useCallback } from "react";
import { toast } from "sonner";
import type { Source } from "@/domains/sources/sources-storage";
import { buildAutoFormatSource } from "@/lib/services/sourceEditingService";
import { useSourceMutations } from "@/hooks/source/useSourceMutations";

/**
 * Slim source-editing actions hook. After PR-7a the in-place editor
 * (`<EditorV4>`) owns formatting + autosave; this hook retains only the
 * batch transforms that operate on the whole source HTML.
 *
 * PR-7f M3d: auto-format goes through `useSourceMutations().save` so the
 * cache flips optimistically and any error rolls back.
 */
export function useSourceEditing(
  source: Source,
  onSourceUpdated?: (s: Source) => void,
) {
  const { save: saveMutation } = useSourceMutations();

  const handleAutoFormatArticles = useCallback(async () => {
    const built = buildAutoFormatSource(source);
    if (!built.source) {
      toast.info("Nisu pronađeni članovi za formatiranje", { description: 'Tražim pattern: "Član X"' });
      return;
    }
    await saveMutation.mutateAsync(built.source);
    onSourceUpdated?.(built.source);
    toast.success(`Formatirano ${built.count} članova`, { description: "Članovi i nazivi su boldovani" });
  }, [source, onSourceUpdated, saveMutation]);

  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return {
    handleAutoFormatArticles,
    scrollToHeading,
  };
}
