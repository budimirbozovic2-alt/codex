import { useEffect, useState } from "react";
import {
  loadSources,
  loadSourcesByCategory,
  onSourcesChanged,
  type Source,
} from "@/lib/sources-storage";
import { useIsMountedRef } from "@/hooks/useIsMountedRef";

/**
 * SSOT subscription for sources scoped to a single category.
 * Re-fetches automatically when ANY source mutation fires (saveSource/deleteSource/invalidateSourcesCache).
 */
export function useCategorySources(categoryId: string | undefined): Source[] {
  const [sources, setSources] = useState<Source[]>([]);
  const mounted = useIsMountedRef();

  useEffect(() => {
    if (!categoryId) { setSources([]); return; }
    const reload = () => {
      loadSourcesByCategory(categoryId).then(s => { if (mounted.current) setSources(s); });
    };
    reload();
    return onSourcesChanged(reload);
  }, [categoryId, mounted]);

  return sources;
}

/**
 * SSOT subscription for ALL sources (used by GlobalSearch).
 * Backed by the module-level cache in sources-storage.ts.
 */
export function useAllSources(enabled: boolean = true): Source[] {
  const [sources, setSources] = useState<Source[]>([]);
  const mounted = useIsMountedRef();

  useEffect(() => {
    if (!enabled) return;
    const reload = () => {
      loadSources().then(s => { if (mounted.current) setSources(s); });
    };
    reload();
    return onSourcesChanged(reload);
  }, [enabled, mounted]);

  return sources;
}
