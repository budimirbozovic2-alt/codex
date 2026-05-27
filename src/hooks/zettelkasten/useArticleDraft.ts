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
  type KnowledgeBaseArticle,
} from "@/lib/zettelkasten-storage";
import { normalizeAliasList } from "@/lib/zettelkasten-aliases";
import { normalizeTagList } from "@/lib/zettelkasten-tags";
import { sameStringSet } from "@/lib/struct-eq";
import { backlinkIndex } from "@/lib/backlink-index";
import type { ZettelEditorHandle } from "@/components/zettelkasten/ZettelEditor";
import { usePersistedDraftMirror } from "@/hooks/usePersistedDraftMirror";
import { htmlToDoc, type EditorDoc } from "@/lib/editor-v4";
import { deriveMarkdown, isDocEmpty } from "@/lib/editor-v4/derived";
import { mdToHtml } from "@/lib/editor-v4/migrate";
import { useKnowledgeBaseMutations } from "@/hooks/zettelkasten/useKnowledgeBaseMutations";

import { logger } from "@/lib/logger";
export interface Draft {
  title: string;
  /** Legacy markdown — derived from `contentDoc` whenever the doc changes. */
  content: string;
  /** Canonical V4 AST — primary write payload from PR-6 onward. */
  contentDoc: EditorDoc;
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
  /** Update `contentDoc` and re-derive legacy `content` (markdown). */
  updateDraftDoc: (doc: EditorDoc) => void;
  flush: () => Promise<KnowledgeBaseArticle | null>;
  saveAndClose: () => Promise<void>;
  resetForArticle: (article: KnowledgeBaseArticle | null, opts?: { autoEditEmpty?: boolean }) => void;
}

const EMPTY_DOC: EditorDoc = { version: 4, content: { type: "doc", content: [] } };

function seedDoc(a: KnowledgeBaseArticle): EditorDoc {
  if (a.contentDoc && a.contentDoc.version === 4 && a.contentDoc.content) return a.contentDoc;
  const md = a.content ?? "";
  if (!md.trim()) return EMPTY_DOC;
  try {
    return htmlToDoc(mdToHtml(md));
  } catch (err) {
    logger.warn("[zettelkasten] seedDoc failed, falling back to empty", err);
    return EMPTY_DOC;
  }
}

function fromArticle(a: KnowledgeBaseArticle): Draft {
  return {
    title: a.title,
    // PR-7c (M3 #10): `a.content` is deprecated/optional post-v22; default
    // to empty string so the Draft contract (required `content`) holds.
    content: a.content ?? "",
    contentDoc: seedDoc(a),
    linkedSourceIds: a.linkedSourceIds ?? [],
    tags: a.tags ?? [],
    aliases: a.aliases ?? [],
  };
}

export function useArticleDraft({ activeId, categoryId, setArticles }: Input): ArticleDraftApi {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const editorRef = useRef<ZettelEditorHandle | null>(null);
  const { save: saveMutation } = useKnowledgeBaseMutations();
  const saveMutationRef = useRef(saveMutation);
  useEffect(() => { saveMutationRef.current = saveMutation; }, [saveMutation]);

  // Audit V4: Use a ref to track the latest draft state. This ensures that
  // the `flush` callback (and its calls during cleanup/unmount) always see
  // the absolute latest data even if the React render cycle hasn't committed
  // the state update to the closure yet.
  const draftRef = useRef<Draft | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Mirror the in-progress draft into the IDB `drafts` table for crash
  // recovery and register dirty state into the global registry so the central
  // nav-guard can see "article X is unsaved" without bespoke wiring.
  // Real persistence still happens via `flush()` on exit / navigation.
  usePersistedDraftMirror({
    key: activeId ? `article:${activeId}` : "article:none",
    source: "zettelkasten-article",
    enabled: Boolean(activeId && draft),
    payload: draft,
  });

  const flush = useCallback(async (): Promise<KnowledgeBaseArticle | null> => {
    const currentDraft = draftRef.current;
    if (!currentDraft || !activeId) return null;
    const fresh = await getArticle(activeId);
    if (!fresh) return null;

    // Audit #11: Perform final normalization only once before saving.
    const titleClean = currentDraft.title.trim() || "Bez naslova";
    const tagsClean = normalizeTagList(currentDraft.tags);
    const aliasesClean = normalizeAliasList(currentDraft.aliases);
    // PR-7b: markdown derived ONCE here on flush, never on keystroke.
    const markdownDerived = deriveMarkdown(currentDraft.contentDoc);

    // PR-7b: derived markdown is the canonical text-shape comparison; per-ref
    // contentDoc equality would always fail across IDB round-trips.
    const dirty =
      titleClean !== fresh.title ||
      markdownDerived !== (fresh.content ?? "") ||
      !sameStringSet(currentDraft.linkedSourceIds, fresh.linkedSourceIds ?? []) ||
      !sameStringSet(tagsClean, fresh.tags ?? []) ||
      !sameStringSet(aliasesClean, fresh.aliases ?? []);
    if (!dirty) return fresh;

    const next: KnowledgeBaseArticle = {
      ...fresh,
      title: titleClean,
      content: markdownDerived,
      contentDoc: currentDraft.contentDoc,
      linkedSourceIds: currentDraft.linkedSourceIds,
      tags: tagsClean,
      aliases: aliasesClean,
      updatedAt: Date.now(),
    };
    try {
      await saveMutation.mutateAsync(next);
    } catch (err) {
      logger.error("[zettelkasten] saveArticle failed", err);
      toast.error("Članak NIJE sačuvan. Kopirajte tekst prije navigacije.");
      return null;
    }
    setArticles(prev => prev.map(a => a.id === next.id ? next : a));
    if (categoryId) {
      backlinkIndex.upsertArticle(categoryId, next);
    }
    return next;
  }, [activeId, categoryId, setArticles, saveMutation]);

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

  /**
   * PR-7b: AST-only keystroke path. Legacy markdown is NOT derived per stroke;
   * `flush()` computes it once via `deriveMarkdown` before persisting.
   */
  const updateDraftDoc = useCallback((doc: EditorDoc) => {
    setDraft(prev => prev ? { ...prev, contentDoc: doc } : prev);
  }, []);

  const saveAndClose = useCallback(async () => {
    const saved = await flush();
    setIsEditing(false);
    setDraft(null);
    if (saved) toast.success("Sačuvano");
  }, [flush]);

  const resetForArticle = useCallback(
    (article: KnowledgeBaseArticle | null, opts?: { autoEditEmpty?: boolean }) => {
      // PR-7c (M3 #10): legacy `article.content.trim()` crashed when the
      // column was dropped (undefined). The AST is SSOT now; `isDocEmpty`
      // walks `contentDoc` and falls back to derivedPlainText.
      if (article && opts?.autoEditEmpty && isDocEmpty(article.contentDoc)) {
        setDraft(fromArticle(article));
        setIsEditing(true);
      } else {
        setDraft(null);
        setIsEditing(false);
      }
    },
    [],
  );

  return { draft, isEditing, editorRef, enterEdit, exitEdit, updateDraft, updateDraftDoc, flush, saveAndClose, resetForArticle };
}
