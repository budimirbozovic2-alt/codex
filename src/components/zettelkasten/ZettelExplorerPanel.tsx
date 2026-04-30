import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import { Compass, Plus, Search, ChevronLeft, ChevronRight, FileText, Link2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { KnowledgeBaseArticle } from "@/lib/zettelkasten-storage";
import { backlinkIndex } from "@/lib/backlink-index";
import { filterByActiveTags, getTagCounts, normalizeTag } from "@/lib/zettelkasten-tags";

type SortMode = "recent" | "alpha" | "linked";

interface Props {
  subjectId: string;
  articles: KnowledgeBaseArticle[];
  activeId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
}

const SORT_LABEL: Record<SortMode, string> = {
  recent: "Najnoviji",
  alpha: "Abecedno",
  linked: "Najviše linkovan",
};

const VISIBLE_ROW_TAGS = 3;

/**
 * Always-visible left rail for the Zettelkasten. Lets the user freely browse
 * the entire article network regardless of whether they're reading the Index,
 * an article, or editing — without imposing any subcategory taxonomy.
 *
 * Tags are an optional, per-article filter facet — they narrow the visible
 * list using OR semantics but never affect search, navigation, or persistence.
 *
 * Memoized so editor keystrokes (which mutate `draft.content` upstream) do not
 * re-render the panel; the only props that change here are `articles`,
 * `activeId`, and the collapse flag.
 */
function ZettelExplorerPanelImpl({
  subjectId,
  articles,
  activeId,
  collapsed,
  onToggleCollapsed,
  onOpen,
  onCreate,
}: Props) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [activeTags, setActiveTags] = useState<Set<string>>(() => new Set());
  const deferredSearch = useDeferredValue(search);

  // Backlink counts power both the "Najviše linkovan" sort and the orphan stat.
  // Recomputed only when the article list itself changes, not on every keystroke.
  const counts = useMemo(
    () => backlinkIndex.getCountsByArticle(subjectId, articles),
    [subjectId, articles],
  );

  const orphans = useMemo(
    () => articles.filter(a => !a.isIndex && (counts.get(a.id) ?? 0) === 0),
    [articles, counts],
  );

  const totalLinks = useMemo(() => {
    let sum = 0;
    for (const v of counts.values()) sum += v;
    return sum;
  }, [counts]);

  // Tag aggregation — refreshes only when articles change. Sorted desc by count.
  const tagCounts = useMemo(() => getTagCounts(articles), [articles]);

  const toggleTag = useCallback((tag: string) => {
    const norm = normalizeTag(tag);
    if (!norm) return;
    setActiveTags(prev => {
      const next = new Set(prev);
      if (next.has(norm)) next.delete(norm);
      else next.add(norm);
      return next;
    });
  }, []);

  const clearTags = useCallback(() => setActiveTags(new Set()), []);

  const visible = useMemo(() => {
    // Filter chain (order matters):
    //  1. Tag filter (OR semantics) narrows first — typically the biggest cut.
    //  2. Title search filters the remaining set.
    //  3. Sort.
    //  4. Index pinning — Index is ALWAYS surfaced even if filters would hide it,
    //     because it's the subject's entry-point and must remain accessible.
    let list: KnowledgeBaseArticle[] = filterByActiveTags(articles, activeTags);

    const q = deferredSearch.trim().toLowerCase();
    if (q) list = list.filter(a => a.title.toLowerCase().includes(q));

    const indexArticle = articles.find(a => a.isIndex);
    list = list.filter(a => !a.isIndex);

    switch (sort) {
      case "alpha":
        list.sort((a, b) => a.title.localeCompare(b.title, "bs"));
        break;
      case "linked":
        list.sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
        break;
      case "recent":
      default:
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
    }

    return indexArticle ? [indexArticle, ...list] : list;
  }, [articles, deferredSearch, sort, counts, activeTags]);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center w-10 shrink-0 border-r border-border bg-card/30 py-2 gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleCollapsed}
          aria-label="Otvori Explorer"
          title="Otvori Explorer"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCreate}
          aria-label="Novi članak"
          title="Novi članak"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside className="flex flex-col w-72 shrink-0 border-r border-border bg-card/30 h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Compass className="h-4 w-4 text-primary" />
          Explorer
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onToggleCollapsed}
          aria-label="Sakrij Explorer"
          title="Sakrij Explorer"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Search + sort */}
      <div className="p-2 space-y-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži članke..."
            className="pl-7 h-8 text-sm"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="w-full justify-between h-8 text-xs">
              <span className="text-muted-foreground">Sortiraj:</span>
              <span className="font-medium">{SORT_LABEL[sort]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {(Object.keys(SORT_LABEL) as SortMode[]).map(m => (
              <DropdownMenuItem key={m} onSelect={() => setSort(m)}>
                {SORT_LABEL[m]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tag filter strip — only renders when at least one tag exists in the subject. */}
      {tagCounts.length > 0 && (
        <div className="p-2 border-b border-border">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Tag className="h-3 w-3" /> Tagovi
            </div>
            {activeTags.size > 0 && (
              <button
                type="button"
                onClick={clearTags}
                className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Očisti ({activeTags.size})
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {tagCounts.map(({ tag, count }) => {
              const active = activeTags.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`text-[10px] px-1.5 py-0.5 rounded-sm transition-colors ${
                    active
                      ? "bg-primary/15 text-foreground font-semibold"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted/70"
                  }`}
                  title={active ? `Ukloni filter "${tag}"` : `Filtriraj po "${tag}"`}
                >
                  {tag} <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Article list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-1">
        {visible.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-6 px-3">
            {search.trim() || activeTags.size > 0
              ? "Nema rezultata za trenutne filtere."
              : "Još uvijek nema članaka."}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {visible.map(a => {
              const isActive = a.id === activeId;
              const isDraft = a.content.trim().length === 0;
              const linkCount = counts.get(a.id) ?? 0;
              const articleTags = a.tags ?? [];
              const visibleTags = articleTags.slice(0, VISIBLE_ROW_TAGS);
              const hiddenTagCount = articleTags.length - visibleTags.length;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(a.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-start gap-1.5 ${
                      isActive
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-accent/50 text-foreground"
                    }`}
                    title={a.title}
                  >
                    {a.isIndex ? (
                      <Compass className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                    ) : (
                      <FileText className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${isDraft ? "text-muted-foreground/60" : "text-muted-foreground"}`} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className={`truncate ${isDraft && !a.isIndex ? "italic text-muted-foreground" : ""} ${a.isIndex ? "font-semibold" : ""}`}>
                        {a.title}
                      </div>
                      {linkCount > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                          <Link2 className="h-2.5 w-2.5" />
                          {linkCount}
                        </div>
                      )}
                      {visibleTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {visibleTags.map(t => {
                            const norm = normalizeTag(t);
                            const active = activeTags.has(norm);
                            return (
                              // Inner button-as-span: nested <button> is invalid HTML,
                              // so we use a span+role="button" with stop-propagation
                              // to allow tag toggle without opening the article.
                              <span
                                key={t}
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleTag(norm);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleTag(norm);
                                  }
                                }}
                                className={`text-[9px] px-1 py-0 rounded-sm cursor-pointer transition-colors ${
                                  active
                                    ? "bg-primary/15 text-foreground font-semibold"
                                    : "bg-muted/40 text-muted-foreground hover:bg-muted/70"
                                }`}
                                title={`Filtriraj po "${norm}"`}
                              >
                                {norm}
                              </span>
                            );
                          })}
                          {hiddenTagCount > 0 && (
                            <span className="text-[9px] px-1 py-0 rounded-sm bg-muted/40 text-muted-foreground">
                              +{hiddenTagCount}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer: stats + create */}
      <div className="border-t border-border p-2 space-y-2">
        <div className="grid grid-cols-3 gap-1 text-center">
          <div className="px-1 py-1 rounded bg-muted/40">
            <div className="text-sm font-semibold leading-tight">{articles.length}</div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Članaka</div>
          </div>
          <div className="px-1 py-1 rounded bg-muted/40">
            <div className="text-sm font-semibold leading-tight">{totalLinks}</div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Linkova</div>
          </div>
          <div className="px-1 py-1 rounded bg-muted/40" title={`${orphans.length} članaka bez ulaznih linkova`}>
            <div className="text-sm font-semibold leading-tight">{orphans.length}</div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Sirote</div>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full gap-1.5 h-8"
          onClick={onCreate}
        >
          <Plus className="h-3.5 w-3.5" /> Novi članak
        </Button>
      </div>
    </aside>
  );
}

export default memo(ZettelExplorerPanelImpl);
