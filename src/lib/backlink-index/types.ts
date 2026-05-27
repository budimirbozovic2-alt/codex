/**
 * Public + internal types for the per-subject backlink index.
 * See `./BacklinkIndex.ts` for behavior; see `./index.ts` for the public barrel.
 */

export interface BacklinkEntry {
  /** Source article that contains the link. */
  articleId: string;
  /** Cached display title (raw) for the source article. */
  title: string;
  /** ~80 char window around the first match. */
  snippet: string;
}

/** Internal: per-subject state shape held inside `BacklinkIndex`. */
export interface SubjectState {
  byTarget: Map<string, Set<string>>;
  snippets: Map<string, string>; // key = `${sourceId}::${normTitle}`
  articleLinks: Map<string, Set<string>>; // sourceId → set of normalized targets (canonical)
  titleById: Map<string, string>; // articleId → raw title (for snippet rendering)
  /** Reverse map: any indexable key (alias or canonical title, normalized) → owning article id. */
  keyToArticleId: Map<string, string>;
  /** Per-article keys we contributed to keyToArticleId (so we can remove them on update/delete). */
  articleKeys: Map<string, Set<string>>;
  /** Monotonic version per (subject, normTitle); useSyncExternalStore tracks this. */
  versionByTarget: Map<string, number>;
  /** Subscribers per normTitle for fine-grained re-renders. */
  subsByTarget: Map<string, Set<() => void>>;
}
