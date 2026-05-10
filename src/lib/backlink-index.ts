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
import { iterateWikiLinks, normalizeKey } from "./zettelkasten-wiki-link";

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

const SNIPPET_PAD = 40;

function norm(title: string): string {
  return normalizeKey(title);
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
        keyToArticleId: new Map(),
        articleKeys: new Map(),
        versionByTarget: new Map(),
        subsByTarget: new Map(),
      };
      this.subjects.set(subjectId, s);
    }
    return s;
  }

  /**
   * True when an index slot has been allocated for this subject (i.e. a
   * `rebuildFromAll` or `upsertArticle` already populated it). Lets callers
   * skip a redundant O(N × avgLinks) full rebuild on view re-mounts triggered
   * by orthogonal state (e.g. category-record renames).
   */
  hasSubject(subjectId: string): boolean {
    return this.subjects.has(subjectId);
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
   * Two passes: (1) build the keyToArticleId map (titles + aliases) so that
   * (2) the link-scanning pass can resolve `[[krivičnog djela]]` against
   * `Krivično djelo`'s aliases regardless of insertion order.
   * Cheap enough to call on subject mount (single O(N × avgLinks) pass).
   */
  rebuildFromAll(subjectId: string, articles: readonly KnowledgeBaseArticle[]): void {
    const s = this.getOrCreate(subjectId);
    s.byTarget.clear();
    s.snippets.clear();
    s.articleLinks.clear();
    s.titleById.clear();
    s.keyToArticleId.clear();
    s.articleKeys.clear();
    // Pass 1: build identity map (title + aliases → article id).
    for (const a of articles) {
      this.registerKeys(s, a);
    }
    // Pass 2: scan content and bucket links under canonical targets.
    for (const a of articles) {
      this.indexArticleLinks(s, a);
    }
    // Bump every version we just touched and notify.
    for (const [t, subs] of s.subsByTarget) {
      s.versionByTarget.set(t, (s.versionByTarget.get(t) ?? 0) + 1);
      for (const fn of subs) fn();
    }
  }

  /** Register an article's title + aliases in the reverse identity map. */
  private registerKeys(s: SubjectState, a: KnowledgeBaseArticle): void {
    const keys = new Set<string>();
    const titleKey = norm(a.title);
    if (titleKey) {
      s.keyToArticleId.set(titleKey, a.id);
      keys.add(titleKey);
    }
    if (Array.isArray(a.aliases)) {
      for (const alias of a.aliases) {
        const k = norm(alias);
        if (!k || k === titleKey) continue;
        // Title wins over alias on collision; first-registered alias wins
        // between articles. Either way we don't overwrite an existing slot.
        if (!s.keyToArticleId.has(k)) {
          s.keyToArticleId.set(k, a.id);
          keys.add(k);
        }
      }
    }
    if (keys.size > 0) s.articleKeys.set(a.id, keys);
  }

  /** Drop this article's contribution to the reverse identity map. */
  private unregisterKeys(s: SubjectState, articleId: string): void {
    const keys = s.articleKeys.get(articleId);
    if (!keys) return;
    for (const k of keys) {
      if (s.keyToArticleId.get(k) === articleId) {
        s.keyToArticleId.delete(k);
      }
    }
    s.articleKeys.delete(articleId);
  }

  /**
   * Scan one article's content for wiki-links and bucket each under the
   * CANONICAL normalized title of the resolved article. Aliases collapse to
   * the same bucket so `BacklinksPanel` groups everything under one source.
   * Unresolved targets fall back to their normalized form (existing behavior
   * for placeholder/orange links).
   */
  private indexArticleLinks(s: SubjectState, a: KnowledgeBaseArticle): void {
    s.titleById.set(a.id, a.title);
    const links = new Set<string>();
    const seenInThis = new Set<string>();
    const selfTitle = norm(a.title);
    for (const m of iterateWikiLinks(a.content)) {
      const targetKey = norm(m.target);
      if (!targetKey) continue;
      // Resolve aliases → canonical title key.
      const resolvedId = s.keyToArticleId.get(targetKey);
      const canonicalKey = resolvedId
        ? norm(s.titleById.get(resolvedId) ?? m.target)
        : targetKey;
      if (canonicalKey === selfTitle) continue; // skip self-refs
      if (seenInThis.has(canonicalKey)) continue;
      seenInThis.add(canonicalKey);
      links.add(canonicalKey);
      let bucket = s.byTarget.get(canonicalKey);
      if (!bucket) {
        bucket = new Set();
        s.byTarget.set(canonicalKey, bucket);
      }
      bucket.add(a.id);
      s.snippets.set(`${a.id}::${canonicalKey}`, snippetFor(a.content, m.index, m.raw.length));
    }
    if (links.size > 0) s.articleLinks.set(a.id, links);
  }

  /**
   * Incremental insert/update of a single article. O(linksInArticle).
   *
   * NOTE on alias changes: this updates THIS article's contribution to the
   * keyToArticleId map, plus its own outgoing links. It does NOT re-scan
   * other articles' content, so a freshly-added alias on article X won't
   * retroactively resolve `[[that-alias]]` links sitting in unrelated
   * articles until those are themselves saved (or until the next
   * `rebuildFromAll`). Acceptable trade-off — full index rebuilds happen on
   * subject (re)mount and on Restore.
   */
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
    // Refresh identity-map keys (title + aliases) for this article.
    this.unregisterKeys(s, article.id);
    this.registerKeys(s, article);
    // Re-scan with the new content + (possibly) new identity map.
    this.indexArticleLinks(s, article);
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
    this.unregisterKeys(s, articleId);
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

  /**
   * Count of incoming wiki-links per article (keyed by article id).
   * Used by the Explorer panel to surface "most-linked" sorting and
   * orphan detection in O(N_articles + N_links). Articles never referenced
   * are absent from the map (callers should treat missing as 0).
   */
  getCountsByArticle(subjectId: string, articles: readonly KnowledgeBaseArticle[]): Map<string, number> {
    const out = new Map<string, number>();
    const s = this.subjects.get(subjectId);
    if (!s) return out;
    for (const a of articles) {
      const ids = s.byTarget.get(norm(a.title));
      if (ids && ids.size > 0) {
        // Self-references are skipped at index time, so size is accurate.
        out.set(a.id, ids.size);
      }
    }
    return out;
  }

  /**
   * Articles with zero incoming links AND that are not the subject's Index.
   * Useful for surfacing "sirote" (orphans) in the Explorer statistics — these
   * are typically branches the user started but never wove into the network.
   */
  getOrphans(subjectId: string, articles: readonly KnowledgeBaseArticle[]): KnowledgeBaseArticle[] {
    const counts = this.getCountsByArticle(subjectId, articles);
    return articles.filter((a) => !a.isIndex && (counts.get(a.id) ?? 0) === 0);
  }

  /** Subscribe to backlink-set changes for one (subject, target). */
  subscribe(subjectId: string, targetTitle: string, listener: () => void): () => void {
    const s = this.getOrCreate(subjectId);
    const t = norm(targetTitle);
    let bucket = s.subsByTarget.get(t);
    if (!bucket) {
      bucket = new Set();
      s.subsByTarget.set(t, bucket);
    }
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

interface KbUpsertPayload {
  subjectId: string;
  article: KnowledgeBaseArticle;
}
interface KbRemovePayload {
  subjectId: string;
  articleId: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX S4: Managed Subscriptions (No module-level side-effects)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Pokreće osluškivanje događaja za BacklinkIndex.
 * Mora se pozvati iz React useEffect-a kako bi se omogućio pravilan cleanup (npr. u CardStateProvider-u).
 */
export function initBacklinkIndexSubscriptions() {
  const unsubUpsert = eventBus.subscribe<KbUpsertPayload>(EVENT_TYPES.KB_ARTICLE_UPSERTED, (p) => {
    if (p?.subjectId && p?.article) backlinkIndex.upsertArticle(p.subjectId, p.article);
  });

  const unsubRemove = eventBus.subscribe<KbRemovePayload>(EVENT_TYPES.KB_ARTICLE_REMOVED, (p) => {
    if (p?.subjectId && p?.articleId) backlinkIndex.removeArticle(p.subjectId, p.articleId);
  });

  return () => {
    unsubUpsert();
    unsubRemove();
  };
}

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
