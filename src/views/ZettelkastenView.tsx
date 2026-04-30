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
  type KnowledgeBaseArticle,
} from "@/lib/zettelkasten-storage";
import { loadSourcesByCategory, type Source } from "@/lib/sources-storage";
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
import MindMapPickerDialog from "@/components/zettelkasten/MindMapPickerDialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";

interface Draft {
  title: string;
  content: string;
  linkedSourceIds: string[];
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
  const [sources, setSources] = useState<Source[]>([]);
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
    Promise.all([
      loadArticlesBySubject(categoryId),
      loadSourcesByCategory(categoryId),
    ]).then(async ([list, srcs]) => {
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
      setSources(srcs);
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

  // Always-current title lookup for the wiki-link auto-create effect, which
  // runs *during* editing and therefore can't rely on the gated memo above.
  // A ref keeps this O(N_articles) work outside the render path.
  const existingTitlesLowerRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    existingTitlesLowerRef.current = new Set(
      articles.map(a => a.title.trim().toLowerCase()),
    );
  }, [articles]);


  // NOTE: Subcategory-based filtering and grid-style organization were removed
  // intentionally. The Zettelkasten is meant to grow organically; imposing the
  // subject's formal taxonomy on top of it defeated the purpose. Browsing,
  // searching, and sorting now live exclusively inside `ZettelExplorerPanel`.

  // ── Persistence ────────────────────────────────
  const flushDraft = useCallback(async (): Promise<KnowledgeBaseArticle | null> => {
    if (!activeArticle || !draft) return null;
    const titleClean = draft.title.trim() || "Bez naslova";
    const dirty =
      titleClean !== activeArticle.title ||
      draft.content !== activeArticle.content ||
      !sameStringSet(draft.linkedSourceIds, activeArticle.linkedSourceIds ?? []);
    if (!dirty) return activeArticle;
    const next: KnowledgeBaseArticle = {
      ...activeArticle,
      title: titleClean,
      content: draft.content,
      linkedSourceIds: draft.linkedSourceIds,
      updatedAt: Date.now(),
    };
    await saveArticle(next);
    setArticles(prev => prev.map(a => a.id === next.id ? next : a));
    eventBus.emit(EVENT_TYPES.KB_ARTICLE_UPSERTED, { subjectId: categoryId!, article: next });
    return next;
  }, [activeArticle, draft, categoryId]);

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

  // ── Auto-create placeholder articles for new [[Wiki Links]] while editing ──
  // Adaptive debounce in [300, 1000]ms driven by typing cadence + pending batch
  // size. Fast typing or large unresolved batches push toward the upper bound
  // (let work accumulate into one tx); idle pauses with a single new link fire
  // near the lower bound (snappy). All lookups + inserts still happen inside
  // ONE Dexie `rw` transaction via `bulkCreateArticlesIfMissing`.
  const lastKeystrokeAtRef = useRef<number>(0);
  const lastIntervalRef = useRef<number>(Number.POSITIVE_INFINITY);
  // Tracks the last overflow-warned pending count so we surface ONE toast per
  // overflow burst instead of one per keystroke while the user keeps typing
  // above the cap. Resets to 0 once the batch falls back under the cap.
  const lastOverflowNotifiedRef = useRef<number>(0);

  // Hard ceiling on how many new placeholder articles a single debounce tick
  // may create. Protects IDB + UI from runaway paste of huge link tables.
  const WIKI_LINK_BATCH_CAP = 50;

  // Reset cadence tracking when switching articles so a fresh edit session
  // starts from "idle" rather than inheriting the previous article's velocity.
  useEffect(() => {
    lastKeystrokeAtRef.current = 0;
    lastIntervalRef.current = Number.POSITIVE_INFINITY;
    lastOverflowNotifiedRef.current = 0;
  }, [activeId]);

  useEffect(() => {
    if (!isEditing || !draft || !categoryId) return;
    const content = draft.content;
    const rootSubId = activeArticle?.rootSubcategoryId;

    // Update typing cadence. First change in a session yields Infinity → idle bias.
    const now = Date.now();
    if (lastKeystrokeAtRef.current > 0) {
      lastIntervalRef.current = now - lastKeystrokeAtRef.current;
    }
    lastKeystrokeAtRef.current = now;

    // Cheap pre-check against in-memory set; bail before scheduling any timer
    // when there is nothing new — the typical keystroke case.
    const matches = Array.from(content.matchAll(/\[\[([^\]]+)\]\]/g))
      .map(m => m[1].trim())
      .filter(Boolean);
    const pendingAll = matches.filter(t => !existingTitlesLowerRef.current.has(t.toLowerCase()));
    if (pendingAll.length === 0) {
      // Nothing pending → reset overflow latch so a future burst notifies fresh.
      lastOverflowNotifiedRef.current = 0;
      return;
    }

    // Apply hard cap. Anything beyond the cap is deferred to the next tick(s):
    // after the current batch persists, `setArticles` grows the ref-backed
    // `existingTitlesLowerRef` (via the sync effect above), and on the next
    // keystroke the still-unresolved tail becomes the new `pendingAll` for the
    // next pass — draining the queue in 50-sized chunks.
    const overflow = pendingAll.length > WIKI_LINK_BATCH_CAP;
    const pending = overflow ? pendingAll.slice(0, WIKI_LINK_BATCH_CAP) : pendingAll;

    if (overflow) {
      // Latch on the *current* overflow size; only re-notify if the size shifts
      // (e.g. the user pasted more, or one chunk drained). Same size = silent.
      if (lastOverflowNotifiedRef.current !== pendingAll.length) {
        lastOverflowNotifiedRef.current = pendingAll.length;
        console.warn(
          `[zettelkasten] Wiki-link batch capped: ${pendingAll.length} candidates → processing ${WIKI_LINK_BATCH_CAP} this tick.`,
        );
        toast.warning(
          `Previše novih wiki-linkova (${pendingAll.length}). Obrađujem ${WIKI_LINK_BATCH_CAP} po koraku — ostatak slijedi.`,
        );
      }
    } else if (lastOverflowNotifiedRef.current !== 0) {
      // Burst drained back under the cap — clear latch so future overflow re-notifies.
      lastOverflowNotifiedRef.current = 0;
    }

    // Adaptive delay computation.
    const BASE_MIN = 300;
    const BASE_MAX = 1000;
    const VEL_FAST = 120;   // <=120ms between keystrokes ⇒ fast typing
    const VEL_IDLE = 400;   // >=400ms ⇒ effectively idle
    const interval = lastIntervalRef.current;
    const velocityWeight = !Number.isFinite(interval)
      ? 0
      : Math.max(0, Math.min(1, (VEL_IDLE - interval) / (VEL_IDLE - VEL_FAST)));
    const batchWeight = Math.max(0, Math.min(1, pending.length / 8));
    const weight = Math.max(velocityWeight, batchWeight);
    const delay = Math.round(BASE_MIN + (BASE_MAX - BASE_MIN) * weight);

    const handle = setTimeout(async () => {
      const created = await bulkCreateArticlesIfMissing(categoryId, pending, rootSubId);
      if (created.length > 0) {
        setArticles(prev => [...created, ...prev]);
        // Keep backlink index hot — each new article may target existing titles.
        for (const a of created) {
          eventBus.emit(EVENT_TYPES.KB_ARTICLE_UPSERTED, { subjectId: categoryId, article: a });
        }
        toast.success(
          created.length === 1
            ? `Kreiran placeholder članak "${created[0].title}"`
            : `Kreirano ${created.length} placeholder članaka`,
        );
      }
    }, delay);
    return () => clearTimeout(handle);
    // `articles` is in the deps so that after a capped batch persists (which
    // updates `existingTitlesLowerRef` via its own sync effect) we still re-run
    // and process the next 50 of the overflow tail, even if the user paused typing.
  }, [draft?.content, isEditing, categoryId, articles, activeArticle]);

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
    setDraft({ title: article.title, content: article.content, linkedSourceIds: article.linkedSourceIds ?? [] });
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
                Zettelkasten — {categoryRec.name}
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
