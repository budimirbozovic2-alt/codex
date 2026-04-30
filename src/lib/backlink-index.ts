/**
 * Per-subject reverse index for Zettelkasten `[[wiki-link]]` references.
 *
 * Why this exists
 * ---------------
 * `BacklinksPanel` previously regex-scanned every article in the subject
 * (O(N × C) bytes per panel mount). At 1000 articles × ~5 KB each that means
 * megabytes of regex work on the main thread on every article switch — the
 * panel would freeze the UI.
 *
 * Design
 * ------
 * - State keyed by `subjectId`: each subject owns its own index, mirroring
 *   the project-wide rule that all knowledge is scoped per category.
 * - For each subject we keep:
 *     - `byTarget`:  Map<normalizedTitle, Set<sourceArticleId>>
 *     - `snippets`:  Map<`${sourceId}::${normalizedTitle}`, snippet>
 *     - `articleTitles`: Map<articleId, normalizedTitle>  (for cheap rename diff)
 *     - `articleLinks`:  Map<articleId, Set<normalizedTitle>>  (to remove on update)
 *
 * - Mutations come from three places:
 *     1. `rebuildFromAll(subjectId, articles)` — full pass on initial load.
 *     2. `upsertArticle(subjectId, article)`  — incremental, run on save.
 *     3. `removeArticle(subjectId, articleId)` — on delete.
 *
 * - `BroadcastChannel` keeps tabs in sync via `kb-article:upserted/removed`
 *   events from `event-bus.ts`. Bootstrap re-fetches the article list when a
 *   foreign-tab event arrives for a subject we have indexed.
 *
 * - React integration via `useSyncExternalStore` so `BacklinksPanel` re-renders
 *   only when the slice it cares about (one target title in one subject)
 *   actually changes.
 */
import { useSyncExternalStore } from "react";
import type { KnowledgeBaseArticle } from "./zettelkasten-storage";
import { eventBus, EVENT_TYPES } from "./event-bus";

export interface BacklinkEntry {
  /** Source article that contains the link. */
  articleId: string;
  /** Cached display title (raw) for the source article. */
  title: string;
  /** ~80 char window around the first match. */
  snippet: string;
}

interface SubjectState {
  byTarget: Map<string, Set<string>>;
  snippets: Map<string, string>; // key = `${sourceId}::${normTitle}`
  articleLinks: Map<string, Set<string>>; // sourceId → set of normalized targets
  titleById: Map<string, string>; // articleId → raw title (for snippet rendering)
  /** Monotonic version per (subject, normTitle); useSyncExternalStore tracks this. */
  versionByTarget: Map<string, number>;
  /** Subscribers per normTitle for fine-grained re-renders. */
  subsByTarget: Map<string, Set<() => void>>;
}

const WIKI_RE = /\[\[([^\]]+)\]\]/g;
const SNIPPET_PAD = 40;

function norm(title: string): string {
  return title.trim().toLowerCase();
}

function snippetFor(content: string, idx: number, matchLen: number): string {
  const start = Math.max(0, idx - SNIPPET_PAD);
  const end = Math.min(content.length, idx + matchLen + SNIPPET_PAD);
  const raw = content.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + raw + (end < content.length ? "…" : "");
}

class BacklinkIndex {
  private subjects: Map<string, SubjectState> = new Map();

  private getOrCreate(subjectId: string): SubjectState {
    let s = this.subjects.get(subjectId);
    if (!s) {
      s = {
        byTarget: new Map(),
        snippets: new Map(),
        articleLinks: new Map(),
        titleById: new Map(),
        versionByTarget: new Map(),
        subsByTarget: new Map(),
      };
      this.subjects.set(subjectId, s);
    }
    return s;
  }

  /** Drop everything we know about this subject (e.g. on Full Restore). */
  clear(subjectId: string): void {
    const s = this.subjects.get(subjectId);
    if (!s) return;
    // Notify all subscribers so panels re-read empty state.
    for (const subs of s.subsByTarget.values()) for (const fn of subs) fn();
    this.subjects.delete(subjectId);
  }

  /**
   * Replace the entire index for `subjectId` from a fresh article list.
   * Cheap enough to call on subject mount (single O(N × avgLinks) pass).
   */
  rebuildFromAll(subjectId: string, articles: readonly KnowledgeBaseArticle[]): void {
    const s = this.getOrCreate(subjectId);
    s.byTarget.clear();
    s.snippets.clear();
    s.articleLinks.clear();
    s.titleById.clear();
    for (const a of articles) {
      this.indexArticle(s, a);
    }
    // Bump every version we just touched and notify.
    for (const [t, subs] of s.subsByTarget) {
      s.versionByTarget.set(t, (s.versionByTarget.get(t) ?? 0) + 1);
      for (const fn of subs) fn();
    }
  }

  private indexArticle(s: SubjectState, a: KnowledgeBaseArticle): void {
    s.titleById.set(a.id, a.title);
    const links = new Set<string>();
    WIKI_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    const seenInThis = new Set<string>();
    while ((m = WIKI_RE.exec(a.content)) !== null) {
      const target = norm(m[1]);
      if (!target || target === norm(a.title)) continue; // skip self-refs
      if (seenInThis.has(target)) continue;
      seenInThis.add(target);
      links.add(target);
      let bucket = s.byTarget.get(target);
      if (!bucket) { bucket = new Set(); s.byTarget.set(target, bucket); }
      bucket.add(a.id);
      s.snippets.set(`${a.id}::${target}`, snippetFor(a.content, m.index, m[0].length));
    }
    if (links.size > 0) s.articleLinks.set(a.id, links);
  }

  /** Incremental insert/update of a single article. O(linksInArticle). */
  upsertArticle(subjectId: string, article: KnowledgeBaseArticle): void {
    const s = this.getOrCreate(subjectId);
    const touched = new Set<string>();
    // Remove previous link contributions from this article.
    const prev = s.articleLinks.get(article.id);
    if (prev) {
      for (const t of prev) {
        s.byTarget.get(t)?.delete(article.id);
        s.snippets.delete(`${article.id}::${t}`);
        if (s.byTarget.get(t)?.size === 0) s.byTarget.delete(t);
        touched.add(t);
      }
      s.articleLinks.delete(article.id);
    }
    // Re-index with the new content.
    this.indexArticle(s, article);
    const next = s.articleLinks.get(article.id);
    if (next) for (const t of next) touched.add(t);
    // Rename: subscribers to the *old* title under which this article was
    // stored need to refresh too. We approximate that by also bumping the
    // article's own normalized title slot if it changed.
    const prevTitle = s.titleById.get(article.id);
    if (prevTitle && norm(prevTitle) !== norm(article.title)) {
      touched.add(norm(prevTitle));
      touched.add(norm(article.title));
    }
    this.bumpAndNotify(s, touched);
  }

  /** Drop every trace of `articleId` and notify watchers of affected targets. */
  removeArticle(subjectId: string, articleId: string): void {
    const s = this.subjects.get(subjectId);
    if (!s) return;
    const touched = new Set<string>();
    const links = s.articleLinks.get(articleId);
    if (links) {
      for (const t of links) {
        s.byTarget.get(t)?.delete(articleId);
        if (s.byTarget.get(t)?.size === 0) s.byTarget.delete(t);
        s.snippets.delete(`${articleId}::${t}`);
        touched.add(t);
      }
      s.articleLinks.delete(articleId);
    }
    const prevTitle = s.titleById.get(articleId);
    if (prevTitle) touched.add(norm(prevTitle));
    s.titleById.delete(articleId);
    this.bumpAndNotify(s, touched);
  }

  private bumpAndNotify(s: SubjectState, targets: Iterable<string>): void {
    for (const t of targets) {
      s.versionByTarget.set(t, (s.versionByTarget.get(t) ?? 0) + 1);
      const subs = s.subsByTarget.get(t);
      if (subs) for (const fn of subs) fn();
    }
  }

  /** O(1) lookup of backlinks for a given target title. */
  getBacklinks(subjectId: string, targetTitle: string, excludeArticleId?: string): BacklinkEntry[] {
    const s = this.subjects.get(subjectId);
    if (!s) return [];
    const t = norm(targetTitle);
    const ids = s.byTarget.get(t);
    if (!ids || ids.size === 0) return [];
    const out: BacklinkEntry[] = [];
    for (const id of ids) {
      if (id === excludeArticleId) continue;
      out.push({
        articleId: id,
        title: s.titleById.get(id) ?? "(bez naslova)",
        snippet: s.snippets.get(`${id}::${t}`) ?? "",
      });
    }
    return out;
  }

  /** Subscribe to backlink-set changes for one (subject, target). */
  subscribe(subjectId: string, targetTitle: string, listener: () => void): () => void {
    const s = this.getOrCreate(subjectId);
    const t = norm(targetTitle);
    let bucket = s.subsByTarget.get(t);
    if (!bucket) { bucket = new Set(); s.subsByTarget.set(t, bucket); }
    bucket.add(listener);
    return () => {
      bucket!.delete(listener);
      if (bucket!.size === 0) s.subsByTarget.delete(t);
    };
  }

  /** Stable version snapshot for useSyncExternalStore. */
  getVersion(subjectId: string, targetTitle: string): number {
    const s = this.subjects.get(subjectId);
    if (!s) return 0;
    return s.versionByTarget.get(norm(targetTitle)) ?? 0;
  }
}

export const backlinkIndex = new BacklinkIndex();

// Cross-tab sync: when another tab upserts/removes an article, mirror it here.
// We receive the full article payload (or at least id+content+title) from the
// emitter so we don't need to re-query IDB.
interface KbUpsertPayload { subjectId: string; article: KnowledgeBaseArticle }
interface KbRemovePayload { subjectId: string; articleId: string }

eventBus.subscribe<KbUpsertPayload>(EVENT_TYPES.KB_ARTICLE_UPSERTED, (p) => {
  if (p?.subjectId && p?.article) backlinkIndex.upsertArticle(p.subjectId, p.article);
});
eventBus.subscribe<KbRemovePayload>(EVENT_TYPES.KB_ARTICLE_REMOVED, (p) => {
  if (p?.subjectId && p?.articleId) backlinkIndex.removeArticle(p.subjectId, p.articleId);
});

/**
 * React hook: returns the live backlink list for a (subject, target) pair.
 * Re-renders only when that specific slot's version bumps.
 */
export function useBacklinks(
  subjectId: string,
  targetTitle: string,
  excludeArticleId?: string,
  paused = false,
): BacklinkEntry[] {
  // Snapshot caches the array reference between version bumps to satisfy
  // useSyncExternalStore's "stable snapshot" contract. Key = subj+title+excl+ver.
  const subscribe = (cb: () => void) => backlinkIndex.subscribe(subjectId, targetTitle, cb);
  const getSnapshot = () => {
    if (paused) return pausedRef(subjectId, targetTitle, excludeArticleId);
    return memoizedSnapshot(subjectId, targetTitle, excludeArticleId);
  };
  const getServerSnapshot = () => EMPTY;
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const EMPTY: BacklinkEntry[] = [];

// Per-key snapshot cache so identical version yields identical reference.
const snapshotCache = new Map<string, { v: number; data: BacklinkEntry[] }>();
function memoizedSnapshot(subjectId: string, targetTitle: string, excludeArticleId?: string): BacklinkEntry[] {
  const key = `${subjectId}::${norm(targetTitle)}::${excludeArticleId ?? ""}`;
  const v = backlinkIndex.getVersion(subjectId, targetTitle);
  const cached = snapshotCache.get(key);
  if (cached && cached.v === v) return cached.data;
  const data = backlinkIndex.getBacklinks(subjectId, targetTitle, excludeArticleId);
  snapshotCache.set(key, { v, data });
  return data;
}

// When `paused`, freeze the last known snapshot so editing doesn't trigger
// recomputation. The cached snapshot stays valid until pause is lifted.
const pausedCache = new Map<string, BacklinkEntry[]>();
function pausedRef(subjectId: string, targetTitle: string, excludeArticleId?: string): BacklinkEntry[] {
  const key = `${subjectId}::${norm(targetTitle)}::${excludeArticleId ?? ""}::paused`;
  let v = pausedCache.get(key);
  if (!v) {
    v = memoizedSnapshot(subjectId, targetTitle, excludeArticleId);
    pausedCache.set(key, v);
  }
  return v;
}

/** Clear the paused snapshot for this slot (call when leaving edit mode). */
export function clearPausedBacklinks(subjectId: string, targetTitle: string, excludeArticleId?: string): void {
  const key = `${subjectId}::${norm(targetTitle)}::${excludeArticleId ?? ""}::paused`;
  pausedCache.delete(key);
}
