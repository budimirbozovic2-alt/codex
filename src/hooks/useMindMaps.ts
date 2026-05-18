import { useEffect, useMemo, useState } from "react";
import {
  loadMindMaps,
  getMindMap,
  onMindMapsChanged,
} from "@/lib/mindmap-storage";
import type { MindMapDoc } from "@/lib/db";
import { useIsMountedRef } from "@/hooks/useIsMountedRef";

/**
 * SSOT subscription for ALL mind maps. Backed by module-level cache + listeners
 * in mindmap-storage.ts.
 */
export function useMindMaps(enabled: boolean = true): { mindMaps: MindMapDoc[]; ready: boolean } {
  const [mindMaps, setMindMaps] = useState<MindMapDoc[]>([]);
  const [ready, setReady] = useState(false);
  const mounted = useIsMountedRef();

  useEffect(() => {
    if (!enabled) return;
    const reload = () => {
      loadMindMaps().then(all => {
        if (!mounted.current) return;
        setMindMaps(all);
        setReady(true);
      });
    };
    reload();
    return onMindMapsChanged(reload);
  }, [enabled, mounted]);

  return { mindMaps, ready };
}

/**
 * Derived view: mind maps filtered by `categoryId`.
 * Re-renders only when underlying list changes (listener-driven).
 */
export function useMindMapsByCategory(categoryId?: string): { mindMaps: MindMapDoc[]; ready: boolean } {
  const { mindMaps, ready } = useMindMaps();
  const filtered = useMemo(
    () => (categoryId ? mindMaps.filter(d => d.categoryId === categoryId) : mindMaps),
    [mindMaps, categoryId],
  );
  return { mindMaps: filtered, ready };
}

/**
 * Single mind map by id, kept fresh via listener subscription.
 * Returns `undefined` while loading, `null` when not found.
 */
export function useMindMap(id: string | undefined): MindMapDoc | null | undefined {
  const [doc, setDoc] = useState<MindMapDoc | null | undefined>(undefined);
  const mounted = useIsMountedRef();

  useEffect(() => {
    if (!id) { setDoc(null); return; }
    const reload = () => {
      getMindMap(id).then(d => { if (mounted.current) setDoc(d ?? null); });
    };
    reload();
    return onMindMapsChanged(reload);
  }, [id, mounted]);

  return doc;
}
