import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, FileText, Search, BookOpen, Compass } from "lucide-react";
import { useCategoryData } from "@/contexts/AppContext";
import {
  loadArticlesBySubject,
  saveArticle,
  deleteArticle,
  findArticleByTitle,
  newArticle,
  type KnowledgeBaseArticle,
} from "@/lib/zettelkasten-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import ZettelEditor from "@/components/zettelkasten/ZettelEditor";
import ZettelPreview from "@/components/zettelkasten/ZettelPreview";
import { toast } from "sonner";

export default function ZettelkastenView() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const { categoryRecords } = useCategoryData();
  const categoryRec = useMemo(
    () => categoryRecords.find(r => r.id === categoryId),
    [categoryRecords, categoryId],
  );

  const [articles, setArticles] = useState<KnowledgeBaseArticle[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Initial load
  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    setLoading(true);
    loadArticlesBySubject(categoryId).then(list => {
      if (!cancelled) {
        setArticles(list);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [categoryId]);

  const activeArticle = useMemo(
    () => articles.find(a => a.id === activeId) ?? null,
    [articles, activeId],
  );

  const existingTitleSet = useMemo(
    () => new Set(articles.map(a => a.title.trim().toLowerCase())),
    [articles],
  );

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

  // ── Mutations ──────────────────────────────────
  const handleCreate = useCallback(async (title?: string, rootSubId?: string) => {
    if (!categoryId) return;
    const t = (title ?? prompt("Naslov novog članka:") ?? "").trim();
    if (!t) return;
    const article = newArticle(categoryId, t, rootSubId ?? selectedSubId ?? undefined);
    await saveArticle(article);
    setArticles(prev => [article, ...prev]);
    setActiveId(article.id);
  }, [categoryId, selectedSubId]);

  const handleUpdate = useCallback(async (patch: Partial<KnowledgeBaseArticle>) => {
    if (!activeArticle) return;
    const next: KnowledgeBaseArticle = { ...activeArticle, ...patch, updatedAt: Date.now() };
    await saveArticle(next);
    setArticles(prev => prev.map(a => a.id === next.id ? next : a));
  }, [activeArticle]);

  const handleDelete = useCallback(async () => {
    if (!activeArticle) return;
    if (!confirm(`Obrisati članak "${activeArticle.title}"?`)) return;
    await deleteArticle(activeArticle.id);
    setArticles(prev => prev.filter(a => a.id !== activeArticle.id));
    setActiveId(null);
    toast.success("Članak obrisan");
  }, [activeArticle]);

  const handleWikiLink = useCallback(async (title: string) => {
    if (!categoryId) return;
    const existing = await findArticleByTitle(categoryId, title);
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    const article = newArticle(categoryId, title, activeArticle?.rootSubcategoryId);
    await saveArticle(article);
    setArticles(prev => [article, ...prev]);
    setActiveId(article.id);
    toast.success(`Kreiran novi članak "${title}"`);
  }, [categoryId, activeArticle]);

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

  // Editor view
  if (activeArticle) {
    return (
      <div className="flex flex-col h-[calc(100vh-3rem)] gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActiveId(null)}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" /> Nazad na listu
          </Button>
          <Input
            value={activeArticle.title}
            onChange={(e) => handleUpdate({ title: e.target.value })}
            placeholder="Naslov članka"
            className="max-w-xl text-base font-semibold"
          />
          <Button type="button" variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-1.5" /> Obriši
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
          <ZettelEditor
            value={activeArticle.content}
            onChange={(content) => handleUpdate({ content })}
          />
          <ZettelPreview
            markdown={activeArticle.content}
            onWikiLink={handleWikiLink}
            existingTitles={existingTitleSet}
          />
        </div>
      </div>
    );
  }

  // Guided Discovery / List view
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
          <div className="grid gap-2">
            {filteredArticles.map(a => {
              const sub = rootSubs.find(s => s.id === a.rootSubcategoryId);
              const preview = a.content.replace(/[#*`[\]]/g, "").trim().slice(0, 140);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActiveId(a.id)}
                  className="text-left p-3 rounded-md border border-border hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="font-semibold text-sm truncate">{a.title}</div>
                    {sub && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                        {sub.name}
                      </span>
                    )}
                  </div>
                  {preview && (
                    <div className="text-xs text-muted-foreground line-clamp-2">{preview}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
