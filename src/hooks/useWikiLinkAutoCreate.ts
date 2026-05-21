import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  bulkCreateArticlesIfMissing,
  type KnowledgeBaseArticle,
} from "@/lib/zettelkasten-storage";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import { iterateWikiLinks, normalizeKey } from "@/lib/zettelkasten-wiki-link";
import { useLatestRef } from "@/hooks/useLatestRef";

import { logger } from "@/lib/logger";
/**
 * Auto-creates placeholder articles for new `[[Wiki Links]]` typed inside
 * the active draft. Extracted out of `ZettelkastenView` to keep that
 * orchestrator slim.
 *
 * Behaviour preserved verbatim from the original inline implementation:
 *   • Adaptive debounce in [300, 1000]ms driven by typing cadence + pending
 *     batch size. Fast typing or large unresolved batches push toward the
 *     upper bound (let work accumulate into one tx); idle pauses with a
 *     single new link fire near the lower bound (snappy).
 *   • Hard cap of 50 placeholder articles per debounce tick. Anything beyond
 *     is deferred to subsequent ticks; one toast per overflow burst (latched
 *     against the current pending size to avoid keystroke-spam).
 *   • Cadence trackers reset on `activeId` change so a fresh edit session
 *     starts from "idle" rather than inheriting the previous velocity.
 *   • All lookups + inserts run inside one Dexie `rw` transaction via
 *     `bulkCreateArticlesIfMissing`.
 *
 * The `articles` dependency is intentional: after a capped batch persists
 * (and `setArticles` grows the title set), we re-run on the next render so
 * the still-unresolved tail can be drained even if the user paused typing.
 */
const WIKI_LINK_BATCH_CAP = 50;
// Pipe-form `[[Target|display]]` is intentionally NOT auto-created — it's
// the author's explicit signal that `Target` already exists or will be
// created by hand. Aliases of existing articles likewise suppress creation.

interface UseWikiLinkAutoCreateParams {
  activeId: string | null;
  categoryId: string | undefined;
  isEditing: boolean;
  draftContent: string | undefined;
  rootSubcategoryId: string | null | undefined;
  articles: KnowledgeBaseArticle[];
  setArticles: React.Dispatch<React.SetStateAction<KnowledgeBaseArticle[]>>;
}

export function useWikiLinkAutoCreate({
  activeId,
  categoryId,
  isEditing,
  draftContent,
  rootSubcategoryId,
  articles,
  setArticles,
}: UseWikiLinkAutoCreateParams): void {
  // Always-current title lookup. A ref keeps this O(N_articles) work out of
  // the render path and lets the auto-create effect read fresh data without
  // re-subscribing.
  const existingTitlesLowerRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Union of titles + aliases — alias matches must NOT trigger placeholder
    // creation, otherwise typing `[[krivičnog djela]]` would spawn a duplicate
    // article alongside the canonical `Krivično djelo`.
    const next = new Set<string>();
    for (const a of articles) {
      next.add(normalizeKey(a.title));
      if (Array.isArray(a.aliases)) {
        for (const alias of a.aliases) next.add(normalizeKey(alias));
      }
    }
    existingTitlesLowerRef.current = next;
  }, [articles]);

  // Cadence + overflow-latch refs.
  const lastKeystrokeAtRef = useRef<number>(0);
  const lastIntervalRef = useRef<number>(Number.POSITIVE_INFINITY);
  const lastOverflowNotifiedRef = useRef<number>(0);

  // Idempotency token bumped after every successful batch persist. Replaces
  // the previous `articles` dependency on the auto-create effect: instead of
  // re-running on every backlink/list update (which reset the debounce timer
  // on each keystroke that hit `setArticles`), we re-run only when the
  // persisted set actually grew. Tail drain after a capped batch still works
  // because the persist callback bumps the token explicitly.
  const [drainTick, setDrainTick] = useState(0);

  // Always-fresh refs for collaborators read inside the debounced setTimeout.
  // Switching to refs prevents re-binding the effect on identity changes of
  // `setArticles` / `rootSubcategoryId`.
  const setArticlesRef = useLatestRef(setArticles);
  const rootSubcategoryIdRef = useLatestRef(rootSubcategoryId ?? null);

  // Reset cadence tracking when switching articles.
  useEffect(() => {
    lastKeystrokeAtRef.current = 0;
    lastIntervalRef.current = Number.POSITIVE_INFINITY;
    lastOverflowNotifiedRef.current = 0;
  }, [activeId]);

  useEffect(() => {
    if (!isEditing || draftContent === undefined || !categoryId) return;
    const content = draftContent;

    // Update typing cadence. First change in a session yields Infinity → idle bias.
    const now = Date.now();
    if (lastKeystrokeAtRef.current > 0) {
      lastIntervalRef.current = now - lastKeystrokeAtRef.current;
    }
    lastKeystrokeAtRef.current = now;

    // Cheap pre-check against in-memory set; bail before scheduling any timer
    // when there is nothing new — the typical keystroke case. Pipe-form
    // matches (`[[T|D]]`) are excluded: those are deliberate references and
    // must not produce placeholders for `D`.
    const matches: string[] = [];
    for (const m of iterateWikiLinks(content)) {
      if (m.hasPipe) continue;
      matches.push(m.target);
    }
    const pendingAll = matches.filter(
      t => !existingTitlesLowerRef.current.has(normalizeKey(t)),
    );
    if (pendingAll.length === 0) {
      lastOverflowNotifiedRef.current = 0;
      return;
    }

    const overflow = pendingAll.length > WIKI_LINK_BATCH_CAP;
    const pending = overflow ? pendingAll.slice(0, WIKI_LINK_BATCH_CAP) : pendingAll;

    if (overflow) {
      if (lastOverflowNotifiedRef.current !== pendingAll.length) {
        lastOverflowNotifiedRef.current = pendingAll.length;
        logger.warn(
          `[zettelkasten] Wiki-link batch capped: ${pendingAll.length} candidates → processing ${WIKI_LINK_BATCH_CAP} this tick.`,
        );
        toast.warning(
          `Previše novih wiki-linkova (${pendingAll.length}). Obrađujem ${WIKI_LINK_BATCH_CAP} po koraku — ostatak slijedi.`,
        );
      }
    } else if (lastOverflowNotifiedRef.current !== 0) {
      lastOverflowNotifiedRef.current = 0;
    }

    const BASE_MIN = 300;
    const BASE_MAX = 1000;
    const VEL_FAST = 120;
    const VEL_IDLE = 400;
    const interval = lastIntervalRef.current;
    const velocityWeight = !Number.isFinite(interval)
      ? 0
      : Math.max(0, Math.min(1, (VEL_IDLE - interval) / (VEL_IDLE - VEL_FAST)));
    const batchWeight = Math.max(0, Math.min(1, pending.length / 8));
    const weight = Math.max(velocityWeight, batchWeight);
    const delay = Math.round(BASE_MIN + (BASE_MAX - BASE_MIN) * weight);

    let cancelled = false;
    const handle = setTimeout(async () => {
      const created = await bulkCreateArticlesIfMissing(
        categoryId,
        pending,
        rootSubcategoryIdRef.current ?? undefined,
      );
      if (cancelled) return;
      if (created.length > 0) {
        // Optimistically expand the in-memory title set so the next keystroke
        // doesn't re-queue the same targets before React commits the new
        // `articles` prop.
        const expanded = new Set(existingTitlesLowerRef.current);
        for (const a of created) expanded.add(normalizeKey(a.title));
        existingTitlesLowerRef.current = expanded;

        setArticlesRef.current(prev => [...created, ...prev]);
        for (const a of created) {
          eventBus.emit(EVENT_TYPES.KB_ARTICLE_UPSERTED, { subjectId: categoryId, article: a });
        }
        toast.success(
          created.length === 1
            ? `Kreiran placeholder članak "${created[0].title}"`
            : `Kreirano ${created.length} placeholder članaka`,
        );
        // Idempotency: re-trigger this effect so any cap-overflow tail can
        // drain now that the persisted set has grown — without reacting to
        // every unrelated `articles` mutation.
        if (overflow) setDrainTick(t => t + 1);
      }
    }, delay);
    return () => { cancelled = true; clearTimeout(handle); };
    // `articles` intentionally NOT a dep: `existingTitlesLowerRef` stays
    // fresh via the separate effect above, and `drainTick` covers tail drain.
  }, [draftContent, isEditing, categoryId, drainTick, rootSubcategoryIdRef, setArticlesRef]);
}
