/**
 * SSOT subscription for ALL mind maps via TanStack Query.
 *
 * PR-H7 Hardening: Squashed horizontal overflow 
 * to strictly adhere to the Safe-Paste constraint.
 */
import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { loadMindMaps, getMindMap } from "@/domains/mindmaps/mindmap-storage";
import type { MindMapDoc } from "@/lib/db-types";
import { queryKeys } from "@/lib/query/keys";

const EMPTY: MindMapDoc[] = [];

export function useMindMaps(
  enabled: boolean = true
): { mindMaps: MindMapDoc[]; ready: boolean } {
  const { data, isSuccess } = useQuery({
    queryKey: queryKeys.mindMaps.all(),
    queryFn: () => loadMindMaps(),
    enabled,
  });
  return { mindMaps: data ?? EMPTY, ready: isSuccess };
}

export function useMindMapsByCategory(
  categoryId?: string
): { mindMaps: MindMapDoc[]; ready: boolean } {
  const { mindMaps, ready } = useMindMaps();
  const filtered = useMemo(
    () => {
      if (!categoryId) return mindMaps;
      return mindMaps.filter((d) => d.categoryId === categoryId);
    },
    [mindMaps, categoryId]
  );
  return { mindMaps: filtered, ready };
}

export function useMindMap(
  id: string | undefined
): MindMapDoc | null | undefined {
  const { data, isFetched } = useQuery({
    queryKey: id 
      ? queryKeys.mindMaps.byId(id) 
      : ["mindMaps", "id", "__none__"],
    queryFn: () => getMindMap(id as string).then((res) => res ?? null),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
  if (!id) return null;
  if (!isFetched) return undefined;
  return data ?? null;
}