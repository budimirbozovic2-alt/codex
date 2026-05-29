import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Plus, Trash2, FileText, Compass,
  Pencil, Check, BookMarked,
} from "lucide-react";
import { useCategoryData } from "@/contexts/AppContext";
import { useWikiLinkAutoCreate } from "@/hooks/useWikiLinkAutoCreate";
import { useZettelkastenBootstrap } from "@/hooks/zettelkasten/useZettelkastenBootstrap";
import { useExplorerCollapsed } from "@/hooks/zettelkasten/useExplorerCollapsed";
import { useArticleDraft } from "@/hooks/zettelkasten/useArticleDraft";
import { useArticleIndex } from "@/hooks/zettelkasten/useArticleIndex";
import { useArticleMutations } from "@/hooks/zettelkasten/useArticleMutations";
import { type Source } from "@/lib/sources-storage";
import { useCategorySources } from "@/hooks/useCategorySources";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ZettelEditor from "@/components/zettelkasten/ZettelEditor";
import ZettelPreview from "@/components/zettelkasten/ZettelPreview";
import BacklinksPanel from "@/components/zettelkasten/BacklinksPanel";
import LinkedSourcesPicker from "@/components/zettelkasten/LinkedSourcesPicker";
import SourceSidePanel from "@/components/zettelkasten/SourceSidePanel";
import ZettelExplorerPanel from "@/components/zettelkasten/ZettelExplorerPanel";
import ZettelTagEditor from "@/components/zettelkasten/ZettelTagEditor";
import ZettelAliasEditor from "@/components/zettelkasten/ZettelAliasEditor";
import MindMapPickerDialog from "@/components/zettelkasten/MindMapPickerDialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";

function ZettelkastenViewImpl() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const { categoryRecords } = useCategoryData();
  const categoryRec = useMemo(
    () => categoryRecords.find(r => r.id === categoryId),
    [categoryRecords, categoryId],
  );

  const subjectName = categoryRec?.name ?? null;
  const subcategoryNames = useMemo(
    () => (categoryRec?.subcategories ?? []).map(s => s.name),
    [categoryRec],
  );

  const sources = useCategorySources(categoryId);

  const { articles, setArticles, loading, indexArticleId, initialActiveId } =
    useZettelkastenBootstrap({ categoryId, subjectName, subcategoryNames });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [readingSourceId, setReadingSourceId] = useState<string | null>(null);
  const [mmPickerOpen, setMmPickerOpen] = useState(false);

  useEffect(() => {
    if (initialActiveId && !activeId) setActiveId(initialActiveId);
  }, [initialActiveId, activeId]);

  const { collapsed: explorerCollapsed, toggle: toggleExplorer } = useExplorerCollapsed();

  const draftApi = useArticleDraft({ activeId, categoryId, setArticles });
  const { draft, isEditing, editorRef } = draftApi;

  const { activeArticle, existingTitleSet, emptyTitleSet } = useArticleIndex({
    articles, activeId, isEditing,
  });

  const mutations = useArticleMutations({
    categoryId, articles, setArticles, setActiveId, setReadingSourceId,
    indexArticleId, activeArticle, draftApi,
  });

  useWikiLinkAutoCreate({
    activeId,
    categoryId,
    isEditing,
    draftContent: draft?.content,
    rootSubcategoryId: activeArticle?.rootSubcategoryId,
    articles,
    setArticles,
  });

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

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full">
      <ZettelExplorerPanel
        subjectId={categoryId!}
        articles={articles}
        activeId={activeId}
        collapsed={explorerCollapsed}
        onToggleCollapsed={toggleExplorer}
        onOpen={mutations.open}
        onCreate={() => mutations.create()}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-hairline">
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
              onClick={mutations.backToIndex}
              className="gap-1.5 shrink-0"
              title="Vrati se na Index članak"
            >
              <Compass className="h-4 w-4" /> Index
            </Button>
          )}
        </div>

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
              <Button onClick={() => mutations.create()} variant="outline" size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Novi članak
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 gap-3 p-4 max-w-4xl mx-auto w-full">
            <div className="flex items-center justify-end gap-1.5">
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

              {isEditing ? (
                <Button type="button" size="sm" onClick={draftApi.saveAndClose} className="gap-1.5">
                  <Check className="h-4 w-4" /> Završi uređivanje
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={() => draftApi.enterEdit(activeArticle)} className="gap-1.5">
                  <Pencil className="h-4 w-4" /> Uredi
                </Button>
              )}

              {!activeArticle.isIndex && (
                <Button type="button" variant="ghost" size="sm" onClick={mutations.remove} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-1.5" /> Obriši
                </Button>
              )}
            </div>

            {isEditing && draft ? (
              <Input
                value={draft.title}
                onChange={(e) => draftApi.updateDraft({ title: e.target.value })}
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

            {isEditing && draft && (
              <LinkedSourcesPicker
                allSources={sources}
                selectedIds={draft.linkedSourceIds}
                onChange={(linkedSourceIds) => draftApi.updateDraft({ linkedSourceIds })}
              />
            )}

            {isEditing && draft && (
              <ZettelTagEditor
                tags={draft.tags}
                onChange={(tags) => draftApi.updateDraft({ tags })}
              />
            )}

            {isEditing && draft && (
              <ZettelAliasEditor
                aliases={draft.aliases}
                onChange={(aliases) => draftApi.updateDraft({ aliases })}
              />
            )}

            <div className="flex flex-col gap-3 flex-1 min-h-0">
              <div className="flex-1 min-h-0">
                {isEditing && draft ? (
                  <ZettelEditor
                    ref={editorRef}
                    valueDoc={draft.contentDoc}
                    onChangeDoc={(doc) => draftApi.updateDraftDoc(doc)}
                    onInsertMindMap={() => setMmPickerOpen(true)}
                    categoryId={categoryId}
                  />
                ) : (
                  <ZettelPreview
                    markdown={displayContent}
                    doc={activeArticle.contentDoc ?? null}
                    onWikiLink={mutations.wikiLink}
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
                onOpen={mutations.open}
                isEditing={isEditing}
              />
            </div>

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
              onPick={(mmId) => editorRef.current?.insertMindmap(mmId)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ZettelkastenView() {
  return (
    <ErrorBoundary label="Zettelkasten" compact>
      <ZettelkastenViewImpl />
    </ErrorBoundary>
  );
}
