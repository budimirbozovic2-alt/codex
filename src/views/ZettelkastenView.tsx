import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Trash2, FileText, Search, BookOpen, Compass,
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
  type KnowledgeBaseArticle,
} from "@/lib/zettelkasten-storage";
import { loadSourcesByCategory, type Source } from "@/lib/sources-storage";
import { sameStringSet } from "@/lib/struct-eq";
import { backlinkIndex } from "@/lib/backlink-index";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
import ArticleListVirtual from "@/components/zettelkasten/ArticleListVirtual";
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
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Active-article view state
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [readingSourceId, setReadingSourceId] = useState<string | null>(null);
  const [mmPickerOpen, setMmPickerOpen] = useState(false);
  const editorRef = useRef<ZettelEditorHandle | null>(null);

  // Initial load
  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      loadArticlesBySubject(categoryId),
      loadSourcesByCategory(categoryId),
    ]).then(([list, srcs]) => {
      if (!cancelled) {
        setArticles(list);
        setSources(srcs);
        // Build the per-subject backlink index once; subsequent saves/deletes
        // update it incrementally via event-bus events emitted below.
        backlinkIndex.rebuildFromAll(categoryId, list);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [categoryId]);

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


  const articleCountByRoot = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of articles) {
      if (a.rootSubcategoryId) {
        map.set(a.rootSubcategoryId, (map.get(a.rootSubcategoryId) ?? 0) + 1);
      }
    }
    return map;
  }, [articles]);

  const filteredArticles = useMemo(() => {
    let list = articles;
    if (selectedSubId) list = list.filter(a => a.rootSubcategoryId === selectedSubId);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(a => a.title.toLowerCase().includes(q));
    }
    return list;
  }, [articles, selectedSubId, search]);

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
  const handleCreate = useCallback(async (title?: string, rootSubId?: string) => {
    if (!categoryId) return;
    const t = (title ?? prompt("Naslov novog članka:") ?? "").trim();
    if (!t) return;
    const article = newArticle(categoryId, t, rootSubId ?? selectedSubId ?? undefined);
    await saveArticle(article);
    setArticles(prev => [article, ...prev]);
    eventBus.emit(EVENT_TYPES.KB_ARTICLE_UPSERTED, { subjectId: categoryId, article });
    setActiveId(article.id);
    // Open new article straight in edit mode
    setDraft({ title: article.title, content: article.content, linkedSourceIds: article.linkedSourceIds ?? [] });
    setIsEditing(true);
  }, [categoryId, selectedSubId]);

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

  const handleBackToList = useCallback(async () => {
    await flushRef.current();
    setActiveId(null);
    setDraft(null);
    setIsEditing(false);
    setReadingSourceId(null);
  }, []);

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
    if (!confirm(`Obrisati članak "${activeArticle.title}"?`)) return;
    await deleteArticle(activeArticle.id);
    eventBus.emit(EVENT_TYPES.KB_ARTICLE_REMOVED, { subjectId: activeArticle.subjectId, articleId: activeArticle.id });
    setArticles(prev => prev.filter(a => a.id !== activeArticle.id));
    setActiveId(null);
    setDraft(null);
    setIsEditing(false);
    toast.success("Članak obrisan");
  }, [activeArticle]);

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

  // ─── Active article view (Notion-style) ───
  if (activeArticle) {
    const linkedIds = (isEditing && draft ? draft.linkedSourceIds : activeArticle.linkedSourceIds) ?? [];
    const linkedSourceObjs = linkedIds
      .map(id => sources.find(s => s.id === id))
      .filter((s): s is Source => Boolean(s))
      .map(s => ({ id: s.id, title: s.title }));
    const readingSource = readingSourceId ? sources.find(s => s.id === readingSourceId) ?? null : null;
    const displayTitle = isEditing && draft ? draft.title : activeArticle.title;
    const displayContent = isEditing && draft ? draft.content : activeArticle.content;

    return (
      <div className="flex flex-col h-[calc(100vh-3rem)] gap-3 p-4 max-w-4xl mx-auto w-full">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleBackToList}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" /> Nazad na listu
          </Button>

          <div className="flex items-center gap-1.5">
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

            <Button type="button" variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-1.5" /> Obriši
            </Button>
          </div>
        </div>

        {/* Title */}
        {isEditing && draft ? (
          <Input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Naslov članka"
            className="text-xl font-bold border-0 px-0 focus-visible:ring-0 shadow-none"
          />
        ) : (
          <h1 className="text-2xl font-bold text-foreground">{displayTitle}</h1>
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
    );
  }

  // ─── Guided Discovery / List view ───
  const rootSubs = categoryRec.subcategories ?? [];

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to={`/subject/${categoryId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Nazad na predmet
        </Link>
        <Button onClick={() => handleCreate()} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Novi članak
        </Button>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <Compass className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Zettelkasten — {categoryRec.name}</h1>
        </div>
        <p className="text-muted-foreground">
          Koju oblast biste željeli više da istražite?
        </p>
      </div>

      {/* Root subcategories grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setSelectedSubId(null)}
          className={`text-left p-4 rounded-lg border transition-colors ${
            selectedSubId === null
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-accent/50"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Sve oblasti</span>
          </div>
          <div className="text-xs text-muted-foreground">{articles.length} članaka</div>
        </button>

        {rootSubs.map(sub => {
          const count = articleCountByRoot.get(sub.id) ?? 0;
          const active = selectedSubId === sub.id;
          return (
            <button
              key={sub.id}
              type="button"
              onClick={() => setSelectedSubId(sub.id)}
              className={`text-left p-4 rounded-lg border transition-colors ${
                active ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"
              }`}
            >
              <div className="font-semibold text-sm mb-1 line-clamp-2">{sub.name}</div>
              <div className="text-xs text-muted-foreground">{count} članaka</div>
            </button>
          );
        })}
      </div>

      {/* Article list */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pretraži članke po naslovu..."
              className="pl-8"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center text-sm text-muted-foreground py-8">Učitavanje...</div>
        ) : filteredArticles.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground mb-3">
              {selectedSubId ? "Nema članaka u ovoj oblasti." : "Još uvijek nema članaka."}
            </p>
            <Button onClick={() => handleCreate()} variant="outline" size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Kreiraj prvi članak
            </Button>
          </Card>
        ) : (
          <ArticleListVirtual
            articles={filteredArticles}
            rootSubs={rootSubs}
            onOpen={handleOpen}
          />
        )}
      </div>
    </div>
  );
}
