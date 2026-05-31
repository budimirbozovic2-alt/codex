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
 * - Post Task-B the EventBus is gone — callers (`useArticleMutations`,
 *   `useArticleDraft`, `useWikiLinkAutoCreate`) invoke `upsertArticle`
 *   / `removeArticle` directly after each IDB write.
 *
 * - React integration (see `./use-backlinks.ts`) uses `useSyncExternalStore`
 *   so `BacklinksPanel` re-renders only when the slice it cares about
 *   (one target title in one subject) actually changes.
 */
import type { KnowledgeBaseArticle } from "../zettelkasten-storage";
import { iterateWikiLinks } from "../zettelkasten-wiki-link";
import { deriveMarkdown } from "../editor-v4/derived";
import type { BacklinkEntry, SubjectState } from "./types";
import { norm, snippetFor } from "./normalize";

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
    // `content` (markdown) is deprecated but legacy/synthetic articles (tests,
    // un-migrated rows) may still carry only the markdown string. Prefer the
    // AST derivation; fall back to `a.content` so the index stays correct.
    const derived = deriveMarkdown(a.contentDoc);
    const body = derived || (typeof a.content === "string" ? a.content : "");
    for (const m of iterateWikiLinks(body)) {
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
      s.snippets.set(`${a.id}::${canonicalKey}`, snippetFor(body, m.index, m.raw.length));
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

  /**
   * Resolve a wiki-link target (raw — may be an alias or grammatical case)
   * to the owning article id. Returns null when no article matches either
   * by title or by alias. Used by `handleWikiLink` to redirect alias clicks
   * to the canonical article without spawning a duplicate placeholder.
   */
  resolveTargetToArticleId(subjectId: string, target: string): string | null {
    const s = this.subjects.get(subjectId);
    if (!s) return null;
    return s.keyToArticleId.get(norm(target)) ?? null;
  }
}

export { BacklinkIndex };
export const backlinkIndex = new BacklinkIndex();
