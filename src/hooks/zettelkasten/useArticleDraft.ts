/**
 * Owner of the per-article editing draft.
 *
 * Responsibilities:
 *  - Hold draft state (title/content/linkedSourceIds/tags/aliases) while editing.
 *  - Compute dirty status against the freshest persisted article (re-read via
 *    `getArticle` on flush) so concurrent wiki-link auto-create writes never
 *    get clobbered by stale closure snapshots.
 *  - Expose stable refs to callers (`flush()` always uses the latest closure).
 *  - Cleanup-flush on activeId change / unmount.
 *
 * The hook never owns navigation: callers decide when to switch articles.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getArticle,
  saveArticle,
  type KnowledgeBaseArticle,
} from "@/lib/zettelkasten-storage";
import { normalizeAliasList } from "@/lib/zettelkasten-aliases";
import { normalizeTagList } from "@/lib/zettelkasten-tags";
import { sameStringSet } from "@/lib/struct-eq";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import type { ZettelEditorHandle } from "@/components/zettelkasten/ZettelEditor";

import { logger } from "@/lib/logger";
export interface Draft {
  title: string;
  content: string;
  linkedSourceIds: string[];
  tags: string[];
  aliases: string[];
}

interface Input {
  activeId: string | null;
  categoryId: string | undefined;
  setArticles: React.Dispatch<React.SetStateAction<KnowledgeBaseArticle[]>>;
}

export interface ArticleDraftApi {
  draft: Draft | null;
  isEditing: boolean;
  editorRef: React.MutableRefObject<ZettelEditorHandle | null>;
  enterEdit: (article: KnowledgeBaseArticle) => void;
  exitEdit: () => void;
  updateDraft: (patch: Partial<Draft>) => void;
  flush: () => Promise<KnowledgeBaseArticle | null>;
  saveAndClose: () => Promise<void>;
  resetForArticle: (article: KnowledgeBaseArticle | null, opts?: { autoEditEmpty?: boolean }) => void;
}

function fromArticle(a: KnowledgeBaseArticle): Draft {
  return {
    title: a.title,
    content: a.content,
    linkedSourceIds: a.linkedSourceIds ?? [],
    tags: a.tags ?? [],
    aliases: a.aliases ?? [],
  };
}

export function useArticleDraft({ activeId, categoryId, setArticles }: Input): ArticleDraftApi {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const editorRef = useRef<ZettelEditorHandle | null>(null);

  // Audit V4: Use a ref to track the latest draft state. This ensures that
  // the `flush` callback (and its calls during cleanup/unmount) always see
  // the absolute latest data even if the React render cycle hasn't committed
  // the state update to the closure yet.
  const draftRef = useRef<Draft | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const flush = useCallback(async (): Promise<KnowledgeBaseArticle | null> => {
    const currentDraft = draftRef.current;
    if (!currentDraft || !activeId) return null;
    const fresh = await getArticle(activeId);
    if (!fresh) return null;

    // Audit #11: Perform final normalization only once before saving.
    const titleClean = currentDraft.title.trim() || "Bez naslova";
    const tagsClean = normalizeTagList(currentDraft.tags);
    const aliasesClean = normalizeAliasList(currentDraft.aliases);

    const dirty =
      titleClean !== fresh.title ||
      currentDraft.content !== fresh.content ||
      !sameStringSet(currentDraft.linkedSourceIds, fresh.linkedSourceIds ?? []) ||
      !sameStringSet(tagsClean, fresh.tags ?? []) ||
      !sameStringSet(aliasesClean, fresh.aliases ?? []);
    if (!dirty) return fresh;

    const next: KnowledgeBaseArticle = {
      ...fresh,
      title: titleClean,
      content: currentDraft.content,
      linkedSourceIds: currentDraft.linkedSourceIds,
      tags: tagsClean,
      aliases: aliasesClean,
      updatedAt: Date.now(),
    };
    try {
      await saveArticle(next);
    } catch (err) {
      logger.error("[zettelkasten] saveArticle failed", err);
      toast.error("Članak NIJE sačuvan. Kopirajte tekst prije navigacije.");
      return null;
    }
    setArticles(prev => prev.map(a => a.id === next.id ? next : a));
    if (categoryId) {
      eventBus.emit(EVENT_TYPES.KB_ARTICLE_UPSERTED, { subjectId: categoryId, article: next });
    }
    return next;
  }, [activeId, categoryId, setArticles]); // Removed 'draft' from dependencies

  // Cleanup-flush on activeId change OR unmount. Capture the CURRENT flush
  // (bound to the OLD activeId) so navigation A→B saves A, not B.
  useEffect(() => {
    return () => { void flush(); };
  }, [flush]);

  const enterEdit = useCallback((article: KnowledgeBaseArticle) => {
    setDraft(fromArticle(article));
    setIsEditing(true);
  }, []);

  const exitEdit = useCallback(() => {
    setIsEditing(false);
    setDraft(null);
  }, []);

  const updateDraft = useCallback((patch: Partial<Draft>) => {
    setDraft(prev => prev ? { ...prev, ...patch } : prev);
  }, []);

  const saveAndClose = useCallback(async () => {
    const saved = await flush();
    setIsEditing(false);
    setDraft(null);
    if (saved) toast.success("Sačuvano");
  }, [flush]);

  const resetForArticle = useCallback(
    (article: KnowledgeBaseArticle | null, opts?: { autoEditEmpty?: boolean }) => {
      if (article && opts?.autoEditEmpty && article.content.trim().length === 0) {
        setDraft(fromArticle(article));
        setIsEditing(true);
      } else {
        setDraft(null);
        setIsEditing(false);
      }
    },
    [],
  );

  return { draft, isEditing, editorRef, enterEdit, exitEdit, updateDraft, flush, saveAndClose, resetForArticle };
}
