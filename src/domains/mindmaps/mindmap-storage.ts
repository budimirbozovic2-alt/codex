/**
 * Mind maps SSOT façade — A1c-2.
 * Data plane delegates to mind-maps queries.
 *
 * PR-H6: Removed destructive listener clearing 
 * during HMR hot-reload cycles.
 */
import type { MindMapDoc } from "@/lib/db-types";
import * as repo from "@/lib/db/queries/mind-maps";
import { invalidateMindMapsQueries } from "@/lib/query/domain-invalidation";
import { logger } from "@/lib/logger";
import { 
  wrapWrite, 
  type WriteResult 
} from "@/lib/persistence/write-result";

export function invalidateMindMapsCache(): void {
  invalidateMindMapsQueries();
}

export async function loadMindMaps(): Promise<MindMapDoc[]> {
  return repo.listAllMindMaps();
}

export async function saveMindMap(
  doc: MindMapDoc
): Promise<WriteResult<void>> {
  const res = await wrapWrite(() => repo.putMindMap(doc));
  if (res.ok === true) {
    invalidateMindMapsCache();
    return res;
  }
  logger.error("[mindmap-storage] save failed", res.error);
  return res;
}

export async function deleteMindMap(id: string): Promise<void> {
  await repo.deleteMindMap(id);
  invalidateMindMapsCache();
}

export async function getMindMap(
  id: string
): Promise<MindMapDoc | undefined> {
  return repo.getMindMap(id);
}