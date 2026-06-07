/**
 * Mind maps SSOT façade — A1c-2.
 * Data plane delegates to mind-maps queries.
 *
 * PR-H6: Removed destructive listener clearing 
 * during HMR hot-reload cycles.
 */
import type { MindMapDoc } from "./db-types";
import * as repo from "./db/queries/mind-maps";
import { logger } from "@/lib/logger";
import { 
  wrapWrite, 
  type WriteResult 
} from "@/lib/persistence/write-result";

type MindMapListener = () => void;
const _listeners = new Set<MindMapListener>();

export function onMindMapsChanged(
  fn: MindMapListener
): () => void {
  _listeners.add(fn);
  return () => { 
    _listeners.delete(fn); 
  };
}

function _notify(): void {
  _listeners.forEach((fn) => {
    try { 
      fn(); 
    } catch (e) { 
      logger.warn("[mindmap-storage] listener fail", e); 
    }
  });
}

export function invalidateMindMapsCache(): void {
  _notify();
}

export async function loadMindMaps(): Promise<MindMapDoc[]> {
  return repo.listAllMindMaps();
}

export async function saveMindMap(
  doc: MindMapDoc
): Promise<WriteResult<void>> {
  const res = await wrapWrite(() => repo.putMindMap(doc));
  if (res.ok === true) {
    _notify();
    return res;
  }
  logger.error("[mindmap-storage] save failed", res.error);
  return res;
}

export async function deleteMindMap(id: string): Promise<void> {
  await repo.deleteMindMap(id);
  _notify();
}

export async function getMindMap(
  id: string
): Promise<MindMapDoc | undefined> {
  return repo.getMindMap(id);
}