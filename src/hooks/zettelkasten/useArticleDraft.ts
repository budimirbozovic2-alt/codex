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
import { sameStringSet } from "@/lib/struct-eq";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import type { ZettelEditorHandle } from "@/components/zettelkasten/ZettelEditor";

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

  const flush = useCallback(async (): Promise<KnowledgeBaseArticle | null> => {
    if (!draft || !activeId) return null;
    const fresh = await getArticle(activeId);
    if (!fresh) return null;
    const titleClean = draft.title.trim() || "Bez naslova";
    const aliasesClean = normalizeAliasList(draft.aliases);
    const dirty =
      titleClean !== fresh.title ||
      draft.content !== fresh.content ||
      !sameStringSet(draft.linkedSourceIds, fresh.linkedSourceIds ?? []) ||
      !sameStringSet(draft.tags, fresh.tags ?? []) ||
      !sameStringSet(aliasesClean, fresh.aliases ?? []);
    if (!dirty) return fresh;
    const next: KnowledgeBaseArticle = {
      ...fresh,
      title: titleClean,
      content: draft.content,
      linkedSourceIds: draft.linkedSourceIds,
      tags: draft.tags,
      aliases: aliasesClean,
      updatedAt: Date.now(),
    };
    try {
      await saveArticle(next);
    } catch (err) {
      console.error("[zettelkasten] saveArticle failed", err);
      toast.error("Članak NIJE sačuvan. Kopirajte tekst prije navigacije.");
      return null;
    }
    setArticles(prev => prev.map(a => a.id === next.id ? next : a));
    if (categoryId) {
      eventBus.emit(EVENT_TYPES.KB_ARTICLE_UPSERTED, { subjectId: categoryId, article: next });
    }
    return next;
  }, [draft, activeId, categoryId, setArticles]);

  // Flush ref so cleanup effect always sees the latest closure.
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; }, [flush]);

  // Cleanup-flush on activeId change OR unmount.
  useEffect(() => {
    return () => { void flushRef.current(); };
  }, [activeId]);

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
    await flushRef.current();
    setIsEditing(false);
    setDraft(null);
    toast.success("Sačuvano");
  }, []);

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
