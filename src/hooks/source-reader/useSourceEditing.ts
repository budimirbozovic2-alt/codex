import { useCallback } from "react";
import { toast } from "sonner";
import type { Source } from "@/lib/sources-storage";
import { persistAutoFormat } from "@/lib/services/sourceEditingService";

/**
 * Slim source-editing actions hook. After PR-7a the in-place editor
 * (`<EditorV4>`) owns formatting + autosave; this hook retains only the
 * batch transforms that operate on the whole source HTML.
 */
export function useSourceEditing(
  source: Source,
  onSourceUpdated?: (s: Source) => void,
) {
  const handleAutoFormatArticles = useCallback(async () => {
    const result = await persistAutoFormat(source, onSourceUpdated);
    if (result.count === 0) {
      toast.info("Nisu pronađeni članovi za formatiranje", { description: 'Tražim pattern: "Član X"' });
      return;
    }
    toast.success(`Formatirano ${result.count} članova`, { description: "Članovi i nazivi su boldovani" });
  }, [source, onSourceUpdated]);

  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return {
    handleAutoFormatArticles,
    scrollToHeading,
  };
}
