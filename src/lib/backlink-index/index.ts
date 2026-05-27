/**
 * Public barrel for `@/lib/backlink-index`.
 * Keep this surface minimal — internal types/helpers stay module-private.
 */
export { backlinkIndex } from "./BacklinkIndex";
export { useBacklinks } from "./use-backlinks";
export { clearPausedBacklinks } from "./snapshot-cache";
export type { BacklinkEntry } from "./types";
