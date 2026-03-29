import { useState, useCallback, useMemo } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { ChevronDown, ChevronRight, ArrowRightLeft, Star, Filter, X, Plus, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { type Card, CARD_TAGS, SectionState } from "@/lib/spaced-repetition";
import { type CategoryRecord } from "@/lib/db";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import BulkImportDialog from "./BulkImportDialog";

interface Props {
  cards: Card[];
  categoryId: string;
  allCategories: CategoryRecord[];
  patchCard: (id: string, fn: (c: Card) => Card) => void;
  toggleTag: (cardId: string, tag: string) => void;
  addCard: (question: string, sections: { title: string; content: string }[], category: string, subcategory?: string, chapter?: string) => Card;
  addFlashCard: (question: string, answer: string, category: string, subcategory?: string) => Card;
}

function stabilityLabel(s: number): { text: string; color: string } {
  if (s >= 30) return { text: "Stabilno", color: "text-green-500" };
  if (s >= 7) return { text: "Srednje", color: "text-yellow-500" };
  return { text: "Slabo", color: "text-red-500" };
}

export default function CardViewMode({ cards, categoryId, allCategories, patchCard, toggleTag, addCard, addFlashCard }: Props) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [addMode, setAddMode] = useState<"essay" | "flash">("flash");
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [newSectionTitle, setNewSectionTitle] = useState("Odgovor");
  const [newSectionContent, setNewSectionContent] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveCardId, setMoveCardId] = useState<string | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState("");

  // Filter state
  const [filterSubcategory, setFilterSubcategory] = useState<string>("__all__");
  const [filterChapter, setFilterChapter] = useState<string>("__all__");
  const [filterType, setFilterType] = useState<"all" | "essay" | "flash" | "mnemonic">("all");
  const [filterTag, setFilterTag] = useState<string>("__all__");

  const otherCategories = useMemo(
    () => allCategories.filter(c => c.id !== categoryId),
    [allCategories, categoryId]
  );

  // Build unique subcategories and chapters
  const uniqueSubcategories = useMemo(() => {
    const set = new Set<string>();
    cards.forEach(c => { if (c.subcategory) set.add(c.subcategory); });
    return Array.from(set).sort();
  }, [cards]);

  const uniqueChapters = useMemo(() => {
    const set = new Set<string>();
    cards.forEach(c => {
      if (filterSubcategory !== "__all__" && c.subcategory !== filterSubcategory) return;
      if (c.chapter) set.add(c.chapter);
    });
    return Array.from(set).sort();
  }, [cards, filterSubcategory]);

  // Apply filters
  const filteredCards = useMemo(() => {
    return cards.filter(c => {
      if (filterSubcategory !== "__all__" && (c.subcategory || "") !== filterSubcategory) return false;
      if (filterChapter !== "__all__" && (c.chapter || "") !== filterChapter) return false;
      if (filterType === "essay" && c.type !== "essay") return false;
      if (filterType === "flash" && c.type !== "flash") return false;
      if (filterType === "mnemonic" && !(c.tags?.includes("mnemonic"))) return false;
      if (filterTag !== "__all__" && !(c.tags?.includes(filterTag))) return false;
      return true;
    });
  }, [cards, filterSubcategory, filterChapter, filterType, filterTag]);

  const hasActiveFilters = filterSubcategory !== "__all__" || filterChapter !== "__all__" || filterType !== "all" || filterTag !== "__all__";

  const resetFilters = useCallback(() => {
    setFilterSubcategory("__all__");
    setFilterChapter("__all__");
    setFilterType("all");
    setFilterTag("__all__");
  }, []);

  const toggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const openMoveModal = useCallback((cardId: string) => {
    setMoveCardId(cardId);
    setTargetCategoryId("");
    setMoveModalOpen(true);
  }, []);

  const confirmMove = useCallback(() => {
    if (!moveCardId || !targetCategoryId) return;
    patchCard(moveCardId, c => ({ ...c, categoryId: targetCategoryId }));
    setMoveModalOpen(false);
    setMoveCardId(null);
  }, [moveCardId, targetCategoryId, patchCard]);

  const handleAddSave = useCallback(() => {
    if (!newQuestion.trim()) return;
    if (addMode === "flash") {
      if (!newAnswer.trim()) return;
      addFlashCard(newQuestion.trim(), newAnswer.trim(), categoryId);
    } else {
      if (!newSectionContent.trim()) return;
      addCard(newQuestion.trim(), [{ title: newSectionTitle.trim() || "Odgovor", content: newSectionContent.trim() }], categoryId);
    }
    toast.success("Kartica kreirana.");
    setNewQuestion(""); setNewAnswer(""); setNewSectionTitle("Odgovor"); setNewSectionContent("");
    setAddDialogOpen(false);
  }, [addMode, newQuestion, newAnswer, newSectionTitle, newSectionContent, categoryId, addCard, addFlashCard]);

  if (cards.length === 0 && !addDialogOpen) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-sm text-muted-foreground">Nema kartica u ovoj kategoriji.</p>
        <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nova kartica
        </Button>
        {renderAddDialog()}
      </div>
    );
  }

  function renderAddDialog() {
    return (
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova kartica</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Type toggle */}
            <div className="flex items-center gap-0.5 rounded-md border p-0.5 w-fit">
              <button onClick={() => setAddMode("flash")} className={cn("px-3 py-1 rounded text-xs font-medium transition-colors", addMode === "flash" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                Blic
              </button>
              <button onClick={() => setAddMode("essay")} className={cn("px-3 py-1 rounded text-xs font-medium transition-colors", addMode === "essay" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                Esej
              </button>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Pitanje</Label>
              <Input value={newQuestion} onChange={e => setNewQuestion(e.target.value)} placeholder="Unesite pitanje..." />
            </div>

            {addMode === "flash" ? (
              <div className="space-y-2">
                <Label className="text-xs">Odgovor</Label>
                <Textarea value={newAnswer} onChange={e => setNewAnswer(e.target.value)} placeholder="Unesite odgovor..." rows={4} />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-xs">Naslov sekcije</Label>
                  <Input value={newSectionTitle} onChange={e => setNewSectionTitle(e.target.value)} placeholder="Odgovor" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Sadržaj</Label>
                  <Textarea value={newSectionContent} onChange={e => setNewSectionContent(e.target.value)} placeholder="Unesite sadržaj..." rows={6} />
                </div>
              </>
            )}

            <Button onClick={handleAddSave} className="w-full gap-2" disabled={!newQuestion.trim()}>
              <Plus className="h-4 w-4" /> Sačuvaj
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter toolbar */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-card p-2.5">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        {/* Subcategory filter */}
        {uniqueSubcategories.length > 0 && (
          <Select value={filterSubcategory} onValueChange={(v) => { setFilterSubcategory(v); setFilterChapter("__all__"); }}>
            <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs">
              <SelectValue placeholder="Potkategorija" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Sve potkategorije</SelectItem>
              {uniqueSubcategories.map(sub => (
                <SelectItem key={sub} value={sub} className="text-xs">{sub}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Chapter filter */}
        {uniqueChapters.length > 0 && (
          <Select value={filterChapter} onValueChange={setFilterChapter}>
            <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
              <SelectValue placeholder="Glava" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Sve glave</SelectItem>
              {uniqueChapters.map(ch => (
                <SelectItem key={ch} value={ch} className="text-xs">{ch}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Type filter */}
        <div className="flex items-center gap-0.5 rounded-md border p-0.5">
          {(["all", "essay", "flash", "mnemonic"] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                filterType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "all" ? "Sve" : t === "essay" ? "Esej" : t === "flash" ? "Blic" : "Mnemo"}
            </button>
          ))}
        </div>

        {/* Tag filter */}
        <Select value={filterTag} onValueChange={setFilterTag}>
          <SelectTrigger className="h-7 w-auto min-w-[110px] text-xs">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Svi tagovi</SelectItem>
            {CARD_TAGS.map(tag => (
              <SelectItem key={tag.id} value={tag.id} className="text-xs">{tag.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Reset + count + actions */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[10px] text-muted-foreground">{filteredCards.length}/{cards.length}</span>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-6 px-2 text-[10px] gap-1">
              <X className="h-3 w-3" /> Reset
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setBulkImportOpen(true)} className="h-7 gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" /> Masovni Import
          </Button>
          <Button variant="default" size="sm" onClick={() => setAddDialogOpen(true)} className="h-7 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Nova kartica
          </Button>
        </div>
      </div>

      {/* Card list */}
      <div className="space-y-1">
        {filteredCards.map(card => {
          const isExpanded = expandedId === card.id;
          const avgStability = card.sections.length > 0
            ? card.sections.reduce((sum, s) => sum + s.stability, 0) / card.sections.length
            : 0;
          const stab = stabilityLabel(avgStability);
          const hasTags = card.tags && card.tags.length > 0;

          return (
            <div key={card.id} className="rounded-lg border bg-card overflow-hidden">
              <button
                onClick={() => toggle(card.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="text-sm text-foreground truncate flex-1">{card.question || "(Bez pitanja)"}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {hasTags && card.tags!.includes("često-na-ispitu") && (
                    <Star className="h-3.5 w-3.5 text-destructive fill-destructive" />
                  )}
                  <span className={cn("text-[10px] font-medium", stab.color)}>{stab.text}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {card.type === "flash" ? "Flash" : "Esej"}
                  </Badge>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
                  <div className="flex items-center gap-2 flex-wrap">
                    {card.subcategory && (
                      <Badge variant="secondary" className="text-[10px] opacity-60">
                        Potkategorija: {card.subcategory}
                      </Badge>
                    )}
                    {card.chapter && (
                      <Badge variant="secondary" className="text-[10px] opacity-60">
                        Glava: {card.chapter}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    {card.sections.map((section, idx) => {
                      const secStab = stabilityLabel(section.stability);
                      const stateLabel = section.state === SectionState.New ? "Novo" : section.state === SectionState.Learning ? "Učenje" : section.state === SectionState.Review ? "Ponavljanje" : "Re-učenje";
                      return (
                        <div key={section.id} className="rounded border bg-background p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-foreground">{section.title || `Sekcija ${idx + 1}`}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground">{stateLabel}</span>
                              <span className={cn("text-[10px] font-medium", secStab.color)}>S: {section.stability.toFixed(1)}</span>
                            </div>
                          </div>
                          <div className="text-xs text-foreground/70 prose prose-xs dark:prose-invert max-w-none line-clamp-4" dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.content) }} />
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {CARD_TAGS.map(tag => {
                      const active = card.tags?.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          onClick={() => toggleTag(card.id, tag.id)}
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                            active ? "bg-primary/10 border-primary text-primary" : "bg-transparent border-border text-muted-foreground hover:border-primary/50"
                          )}
                        >
                          {tag.label}
                        </button>
                      );
                    })}
                  </div>

                  <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => openMoveModal(card.id)}>
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Premjesti u drugu kategoriju
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {filteredCards.length === 0 && hasActiveFilters && (
          <div className="text-center py-12 text-muted-foreground text-sm space-y-2">
            <p>Nema kartica koje odgovaraju filterima.</p>
            <Button variant="outline" size="sm" onClick={resetFilters}>Resetuj filtere</Button>
          </div>
        )}
      </div>

      {/* Move modal */}
      <Dialog open={moveModalOpen} onOpenChange={setMoveModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Premjesti karticu</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={targetCategoryId} onValueChange={setTargetCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Odaberi kategoriju..." />
              </SelectTrigger>
              <SelectContent>
                {otherCategories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={confirmMove} disabled={!targetCategoryId} className="w-full">
              Premjesti
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {renderAddDialog()}
      <BulkImportDialog open={bulkImportOpen} onOpenChange={setBulkImportOpen} categoryId={categoryId} addFlashCard={addFlashCard} />
    </div>
  );
}
