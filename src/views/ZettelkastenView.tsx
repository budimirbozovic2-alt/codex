import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Trash2, FileText, Compass,
  Pencil, Check, BookMarked,
} from "lucide-react";
import { useCategoryData } from "@/contexts/AppContext";
import {
  loadArticlesBySubject,
  saveArticle,
  deleteArticle,
  findArticleByTitle,
  newArticle,
  bulkCreateArticlesIfMissing,
  ensureIndexArticle,
  getArticle,
  type KnowledgeBaseArticle,
} from "@/lib/zettelkasten-storage";
import { useWikiLinkAutoCreate } from "@/hooks/useWikiLinkAutoCreate";
import { type Source } from "@/lib/sources-storage";
import { useCategorySources } from "@/hooks/useCategorySources";
import { sameStringSet } from "@/lib/struct-eq";
import { backlinkIndex } from "@/lib/backlink-index";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ZettelEditor, { type ZettelEditorHandle } from "@/components/zettelkasten/ZettelEditor";
import ZettelPreview from "@/components/zettelkasten/ZettelPreview";
import BacklinksPanel from "@/components/zettelkasten/BacklinksPanel";
import LinkedSourcesPicker from "@/components/zettelkasten/LinkedSourcesPicker";
import SourceSidePanel from "@/components/zettelkasten/SourceSidePanel";
import ZettelExplorerPanel from "@/components/zettelkasten/ZettelExplorerPanel";
import ZettelTagEditor from "@/components/zettelkasten/ZettelTagEditor";
import MindMapPickerDialog from "@/components/zettelkasten/MindMapPickerDialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";

interface Draft {
  title: string;
  content: string;
  linkedSourceIds: string[];
  /** Always normalized; mirrors the article's persisted tag list. */
  tags: string[];
}

export default function ZettelkastenView() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const { categoryRecords } = useCategoryData();
  const categoryRec = useMemo(
    () => categoryRecords.find(r => r.id === categoryId),
    [categoryRecords, categoryId],
  );

  const [articles, setArticles] = useState<KnowledgeBaseArticle[]>([]);
  const sources = useCategorySources(categoryId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Index article id (the auto-created entry-point). Used by "Back to Index"
  // navigation. Resolved during initial load and kept in sync with `articles`.
  const indexArticleId = useMemo(
    () => articles.find(a => a.isIndex)?.id ?? null,
    [articles],
  );

  // Explorer panel collapsed state — persisted per user across sessions.
  const EXPLORER_COLLAPSED_KEY = "zettel.explorer.collapsed";
  const [explorerCollapsed, setExplorerCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(EXPLORER_COLLAPSED_KEY) === "1"; } catch { return false; }
  });
  const toggleExplorer = useCallback(() => {
    setExplorerCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(EXPLORER_COLLAPSED_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Active-article view state
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [readingSourceId, setReadingSourceId] = useState<string | null>(null);
  const [mmPickerOpen, setMmPickerOpen] = useState(false);
  const editorRef = useRef<ZettelEditorHandle | null>(null);

  // Initial load — also ensures the subject has its Index article (auto-creates
  // it on first visit, or promotes a pre-existing same-titled article during
  // migration). The user always lands on the Index when no other article is open.
  useEffect(() => {
    if (!categoryId || !categoryRec) return;
    let cancelled = false;
    setLoading(true);
    loadArticlesBySubject(categoryId).then(async (list) => {
      if (cancelled) return;
      // Seed Index article using the subject's subcategory names as discovery
      // hints (NOT structural tags — they're just initial wiki-link suggestions
      // the user is free to ignore, rename, or delete).
      const suggested = (categoryRec.subcategories ?? []).map(s => s.name);
      const idx = await ensureIndexArticle(categoryId, categoryRec.name, suggested);
      if (cancelled) return;

      // Merge the (possibly newly-created or promoted) Index back into the list.
      const merged = list.some(a => a.id === idx.id)
        ? list.map(a => a.id === idx.id ? idx : a)
        : [idx, ...list];

      setArticles(merged);
      backlinkIndex.rebuildFromAll(categoryId, merged);
      // Default landing: Index article in read mode.
      setActiveId(prev => prev ?? idx.id);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [categoryId, categoryRec]);

  const activeArticle = useMemo(
    () => articles.find(a => a.id === activeId) ?? null,
    [articles, activeId],
  );

  // Title sets are consumed only by `<ZettelPreview>` (read-only mode). When
  // the user is editing, the preview is unmounted, so we skip building these
  // sets entirely — guarantees zero work for these memos during typing bursts
  // (and during any `articles` mutation that lands while editing, e.g. after
  // a wiki-link auto-create batch persists).
  const existingTitleSet = useMemo(
    () => isEditing
      ? new Set<string>()
      : new Set(articles.map(a => a.title.trim().toLowerCase())),
    [articles, isEditing],
  );

  const emptyTitleSet = useMemo(
    () => isEditing
      ? new Set<string>()
      : new Set(
          articles
            .filter(a => a.content.trim().length === 0)
            .map(a => a.title.trim().toLowerCase()),
        ),
    [articles, isEditing],
  );

  // Wiki-link auto-create concern lives in `useWikiLinkAutoCreate` (called below).


  // NOTE: Subcategory-based filtering and grid-style organization were removed
  // intentionally. The Zettelkasten is meant to grow organically; imposing the
  // subject's formal taxonomy on top of it defeated the purpose. Browsing,
  // searching, and sorting now live exclusively inside `ZettelExplorerPanel`.

  // ── Persistence ────────────────────────────────
  const flushDraft = useCallback(async (): Promise<KnowledgeBaseArticle | null> => {
    if (!draft || !activeId) return null;
    // V4: Read the FRESHEST persisted article, not the closure snapshot. The
    // wiki-link auto-create pipeline can mutate `articles[activeId]` while the
    // user is typing; using a stale `activeArticle` reference would clobber
    // those server-side fields (e.g. linkedSourceIds expansions) on flush.
    const fresh = await getArticle(activeId);
    if (!fresh) return null;
    const titleClean = draft.title.trim() || "Bez naslova";
    const dirty =
      titleClean !== fresh.title ||
      draft.content !== fresh.content ||
      !sameStringSet(draft.linkedSourceIds, fresh.linkedSourceIds ?? []) ||
      !sameStringSet(draft.tags, fresh.tags ?? []);
    if (!dirty) return fresh;
    const next: KnowledgeBaseArticle = {
      ...fresh,
      title: titleClean,
      content: draft.content,
      linkedSourceIds: draft.linkedSourceIds,
      tags: draft.tags,
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
    eventBus.emit(EVENT_TYPES.KB_ARTICLE_UPSERTED, { subjectId: categoryId!, article: next });
    return next;
  }, [draft, activeId, categoryId]);

  // Cleanup-flush: when leaving edit mode without explicit save, when switching
  // articles, or when the view unmounts. Use a ref to always read the latest.
  const flushRef = useRef(flushDraft);
  useEffect(() => { flushRef.current = flushDraft; }, [flushDraft]);

  // Flush + reset draft when active article changes
  useEffect(() => {
    return () => {
      // On effect cleanup (article id change OR unmount), persist any pending draft.
      void flushRef.current();
    };
  }, [activeId]);

  // ── Auto-create placeholder articles for new [[Wiki Links]] (extracted) ──
  useWikiLinkAutoCreate({
    activeId,
    categoryId,
    isEditing,
    draftContent: draft?.content,
    rootSubcategoryId: activeArticle?.rootSubcategoryId,
    articles,
    setArticles,
  });

  // ── Mutations ──────────────────────────────────
  const handleCreate = useCallback(async (title?: string) => {
    if (!categoryId) return;
    const t = (title ?? prompt("Naslov novog članka:") ?? "").trim();
    if (!t) return;
    // Articles created via Explorer "+" or top bar are taxonomy-free; they
    // join the network organically via wiki-links written into them later.
    const article = newArticle(categoryId, t);
    await saveArticle(article);
    setArticles(prev => [article, ...prev]);
    eventBus.emit(EVENT_TYPES.KB_ARTICLE_UPSERTED, { subjectId: categoryId, article });
    setActiveId(article.id);
    // Open new article straight in edit mode
    setDraft({ title: article.title, content: article.content, linkedSourceIds: article.linkedSourceIds ?? [], tags: article.tags ?? [] });
    setIsEditing(true);
  }, [categoryId]);

  const handleOpen = useCallback((id: string) => {
    setReadingSourceId(null);
    setActiveId(id);
    // Auto-enter edit mode for empty drafts so the user can start writing immediately.
    const target = articles.find(a => a.id === id);
    if (target && target.content.trim().length === 0) {
      setDraft({
        title: target.title,
        content: target.content,
        linkedSourceIds: target.linkedSourceIds ?? [],
        tags: target.tags ?? [],
      });
      setIsEditing(true);
    } else {
      setIsEditing(false);
      setDraft(null);
    }
  }, [articles]);

  // "Back" from a regular article returns the user to the Index article (the
  // entry-point for organic exploration). If the Index doesn't exist for any
  // reason, fall back to clearing the active selection.
  const handleBackToIndex = useCallback(async () => {
    await flushRef.current();
    setReadingSourceId(null);
    setDraft(null);
    setIsEditing(false);
    if (indexArticleId) {
      setActiveId(indexArticleId);
    } else {
      setActiveId(null);
    }
  }, [indexArticleId]);

  const handleEnterEdit = useCallback(() => {
    if (!activeArticle) return;
    setDraft({
      title: activeArticle.title,
      content: activeArticle.content,
      linkedSourceIds: activeArticle.linkedSourceIds ?? [],
      tags: activeArticle.tags ?? [],
    });
    setIsEditing(true);
  }, [activeArticle]);

  const handleSaveAndClose = useCallback(async () => {
    await flushRef.current();
    setIsEditing(false);
    setDraft(null);
    toast.success("Sačuvano");
  }, []);

  const handleDelete = useCallback(async () => {
    if (!activeArticle) return;
    // The Index article is the subject's entry-point and must always exist —
    // deleting it would leave the Zettelkasten orphaned.
    if (activeArticle.isIndex) {
      toast.error("Index članak (polazna tačka predmeta) se ne može obrisati.");
      return;
    }
    if (!confirm(`Obrisati članak "${activeArticle.title}"?`)) return;
    await deleteArticle(activeArticle.id);
    eventBus.emit(EVENT_TYPES.KB_ARTICLE_REMOVED, { subjectId: activeArticle.subjectId, articleId: activeArticle.id });
    setArticles(prev => prev.filter(a => a.id !== activeArticle.id));
    // After delete, return to the Index rather than to a non-existent list.
    if (indexArticleId && indexArticleId !== activeArticle.id) {
      setActiveId(indexArticleId);
    } else {
      setActiveId(null);
    }
    setDraft(null);
    setIsEditing(false);
    toast.success("Članak obrisan");
  }, [activeArticle, indexArticleId]);

  // In-flight guard: dedupes parallel clicks on the same wiki-link title.
  // Maps normalized title -> Promise resolving to the article id to open.
  const wikiLinkInFlightRef = useRef<Map<string, Promise<string | null>>>(new Map());

  const handleWikiLink = useCallback(async (title: string) => {
    if (!categoryId) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();

    // Persist current draft before navigating away
    await flushRef.current();

    // Coalesce concurrent clicks on the same title into a single transaction.
    let pending = wikiLinkInFlightRef.current.get(key);
    if (!pending) {
      pending = (async (): Promise<string | null> => {
        try {
          // Atomic open-or-create within a single Dexie rw transaction.
          const created = await bulkCreateArticlesIfMissing(
            categoryId,
            [trimmed],
            activeArticle?.rootSubcategoryId,
          );
          if (created.length > 0) {
            const article = created[0];
            setArticles(prev => [article, ...prev]);
            eventBus.emit(EVENT_TYPES.KB_ARTICLE_UPSERTED, { subjectId: categoryId, article });
            toast.success(`Kreiran novi članak "${article.title}"`);
            return article.id;
          }
          // Already existed → resolve via case-insensitive lookup.
          const existing = await findArticleByTitle(categoryId, trimmed);
          return existing?.id ?? null;
        } finally {
          wikiLinkInFlightRef.current.delete(key);
        }
      })();
      wikiLinkInFlightRef.current.set(key, pending);
    }

    const id = await pending;
    if (id) handleOpen(id);
  }, [categoryId, activeArticle, handleOpen]);

  const handlePickMindMap = useCallback((mmId: string) => {
    editorRef.current?.insertBlock(`::mindmap[${mmId}]`);
  }, []);

  // ── Render ─────────────────────────────────────
  if (!categoryRec) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Predmet nije pronađen.
        <div className="mt-3">
          <Link to="/" className="underline">Nazad</Link>
        </div>
      </div>
    );
  }

  // Compute view-specific data only when an article is active.
  const linkedIds = activeArticle
    ? ((isEditing && draft ? draft.linkedSourceIds : activeArticle.linkedSourceIds) ?? [])
    : [];
  const linkedSourceObjs = linkedIds
    .map(id => sources.find(s => s.id === id))
    .filter((s): s is Source => Boolean(s))
    .map(s => ({ id: s.id, title: s.title }));
  const readingSource = readingSourceId ? sources.find(s => s.id === readingSourceId) ?? null : null;
  const displayTitle = activeArticle
    ? (isEditing && draft ? draft.title : activeArticle.title)
    : "";
  const displayContent = activeArticle
    ? (isEditing && draft ? draft.content : activeArticle.content)
    : "";

  // Unified layout: Explorer rail (left) + main pane (right).
  // The Explorer is always present so the user has a stable map of the
  // organic network even while reading or editing a single article.
  return (
    <div className="flex h-[calc(100vh-3rem)] w-full">
      <ZettelExplorerPanel
        subjectId={categoryId!}
        articles={articles}
        activeId={activeId}
        collapsed={explorerCollapsed}
        onToggleCollapsed={toggleExplorer}
        onOpen={handleOpen}
        onCreate={() => handleCreate()}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar — always visible */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to={`/subject/${categoryId}`}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ArrowLeft className="h-4 w-4" /> Predmet
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <Compass className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold truncate">
                Lokalni Wiki — {categoryRec.name}
              </span>
            </div>
          </div>

          {activeArticle && !activeArticle.isIndex && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleBackToIndex}
              className="gap-1.5 shrink-0"
              title="Vrati se na Index članak"
            >
              <Compass className="h-4 w-4" /> Index
            </Button>
          )}
        </div>

        {/* Main pane */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Učitavanje...
          </div>
        ) : !activeArticle ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-md space-y-3">
              <Compass className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground">
                Izaberite članak iz Explorer panela ili kreirajte novi da započnete istraživanje.
              </p>
              <Button onClick={() => handleCreate()} variant="outline" size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Novi članak
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 gap-3 p-4 max-w-4xl mx-auto w-full">
            {/* Article action bar */}
            <div className="flex items-center justify-end gap-1.5">
              {/* Source picker — opens overlay sheet (no split screen) */}
              {linkedSourceObjs.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="gap-1.5">
                      <BookMarked className="h-4 w-4" /> Otvori izvor
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-w-xs">
                    {linkedSourceObjs.map(s => (
                      <DropdownMenuItem key={s.id} onSelect={() => setReadingSourceId(s.id)}>
                        <FileText className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
                        <span className="truncate">{s.title}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled title="Poveži izvor u režimu uređivanja">
                  <BookMarked className="h-4 w-4" /> Otvori izvor
                </Button>
              )}

              {/* Read / Edit mode toggle */}
              {isEditing ? (
                <Button type="button" size="sm" onClick={handleSaveAndClose} className="gap-1.5">
                  <Check className="h-4 w-4" /> Završi uređivanje
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={handleEnterEdit} className="gap-1.5">
                  <Pencil className="h-4 w-4" /> Uredi
                </Button>
              )}

              {!activeArticle.isIndex && (
                <Button type="button" variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-1.5" /> Obriši
                </Button>
              )}
            </div>

            {/* Title */}
            {isEditing && draft ? (
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Naslov članka"
                className="text-xl font-bold border-0 px-0 focus-visible:ring-0 shadow-none"
                disabled={activeArticle.isIndex}
                title={activeArticle.isIndex ? "Naslov Index članka prati naziv predmeta" : undefined}
              />
            ) : (
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                {activeArticle.isIndex && <Compass className="h-5 w-5 text-primary" />}
                {displayTitle}
              </h1>
            )}

            {/* Linked sources picker (edit only) — read mode shows chips inside Preview */}
            {isEditing && draft && (
              <LinkedSourcesPicker
                allSources={sources}
                selectedIds={draft.linkedSourceIds}
                onChange={(linkedSourceIds) => setDraft({ ...draft, linkedSourceIds })}
              />
            )}

            {/* Tag editor (edit only) — pure Explorer-side filter facet, never shown in read mode. */}
            {isEditing && draft && (
              <ZettelTagEditor
                tags={draft.tags}
                onChange={(tags) => setDraft({ ...draft, tags })}
              />
            )}

            {/* Single-pane content area (no split screen) */}
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              <div className="flex-1 min-h-0">
                {isEditing && draft ? (
                  <ZettelEditor
                    ref={editorRef}
                    value={draft.content}
                    onChange={(content) => setDraft({ ...draft, content })}
                    onInsertMindMap={() => setMmPickerOpen(true)}
                  />
                ) : (
                  <ZettelPreview
                    markdown={displayContent}
                    onWikiLink={handleWikiLink}
                    existingTitles={existingTitleSet}
                    emptyTitles={emptyTitleSet}
                    linkedSources={linkedSourceObjs}
                    onSourceClick={(sid) => setReadingSourceId(sid)}
                    categoryId={categoryId!}
                  />
                )}
              </div>
              <BacklinksPanel
                subjectId={categoryId!}
                activeArticleId={activeArticle.id}
                activeTitle={activeArticle.title}
                onOpen={handleOpen}
                isEditing={isEditing}
              />
            </div>

            {/* Source overlay (Sheet) — replaces previous side-by-side split */}
            <Sheet open={Boolean(readingSource)} onOpenChange={(open) => { if (!open) setReadingSourceId(null); }}>
              <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
                {readingSource && (
                  <SourceSidePanel
                    source={readingSource}
                    categoryId={categoryId!}
                    onClose={() => setReadingSourceId(null)}
                  />
                )}
              </SheetContent>
            </Sheet>

            <MindMapPickerDialog
              open={mmPickerOpen}
              onOpenChange={setMmPickerOpen}
              categoryId={categoryId!}
              onPick={handlePickMindMap}
            />
          </div>
        )}
      </div>
    </div>
  );
}
