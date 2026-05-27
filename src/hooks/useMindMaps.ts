import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  loadMindMaps,
  getMindMap,
} from "@/lib/mindmap-storage";
import type { MindMapDoc } from "@/lib/db";
import { queryKeys } from "@/lib/query/keys";

const EMPTY: MindMapDoc[] = [];

/**
 * SSOT subscription for ALL mind maps via TanStack Query.
 * PR-7f M2 — invalidacija dolazi automatski iz `bridges.ts`
 * (`onMindMapsChanged` → `['mindMaps']`).
 */
export function useMindMaps(enabled: boolean = true): { mindMaps: MindMapDoc[]; ready: boolean } {
  const { data, isSuccess } = useQuery({
    queryKey: queryKeys.mindMaps.all(),
    queryFn: () => loadMindMaps(),
    enabled,
  });
  return { mindMaps: data ?? EMPTY, ready: isSuccess };
}

/**
 * Derived view: mind maps filtered by `categoryId`.
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
 * Single mind map by id, kept fresh via TanStack cache.
 * Returns `undefined` while loading, `null` when not found.
 */
export function useMindMap(id: string | undefined): MindMapDoc | null | undefined {
  const { data, isFetched } = useQuery({
    queryKey: id ? queryKeys.mindMaps.byId(id) : ["mindMaps", "id", "__none__"],
    queryFn: async () => (await getMindMap(id as string)) ?? null,
    enabled: !!id,
  });
  if (!id) return null;
  if (!isFetched) return undefined;
  return data ?? null;
}
