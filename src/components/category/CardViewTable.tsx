import { sanitizeHtml } from "@/lib/sanitize";
import { ChevronDown, ChevronRight, ArrowRightLeft, Star, Link2, BookOpen, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Card, CARD_TAGS, SectionState } from "@/lib/spaced-repetition";
import { type CategoryRecord } from "@/lib/db";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function stabilityLabel(s: number): { text: string; color: string } {
  if (s >= 30) return { text: "Stabilno", color: "text-green-500" };
  if (s >= 7) return { text: "Srednje", color: "text-yellow-500" };
  return { text: "Slabo", color: "text-red-500" };
}

interface Props {
  filteredCards: Card[];
  allCategories: CategoryRecord[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  toggleTag: (cardId: string, tag: string) => void;
  onEdit?: (card: Card) => void;
  onDelete?: (id: string) => void;
  onOpenMoveModal: (cardId: string) => void;
  hasActiveFilters: boolean;
  totalCount: number;
  onResetFilters: () => void;
}

export default function CardViewTable({
  filteredCards, allCategories, expandedId, onToggle,
  selectionMode, selectedIds, onToggleSelection,
  toggleTag, onEdit, onDelete, onOpenMoveModal,
  hasActiveFilters, totalCount, onResetFilters,
}: Props) {
  return (
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
            <div className="w-full flex items-center gap-3 px-4 py-3">
              {selectionMode && (
                <Checkbox
                  checked={selectedIds.has(card.id)}
                  onCheckedChange={() => onToggleSelection(card.id)}
                  className="shrink-0"
                />
              )}
              <button
                onClick={() => onToggle(card.id)}
                className="flex-1 flex items-center gap-3 text-left hover:bg-accent/30 transition-colors rounded"
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
            </div>

            {isExpanded && (
              <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
                <div className="flex items-center gap-2 flex-wrap">
                  {card.subcategoryId && (() => {
                    const cr = allCategories.find(c => c.id === card.categoryId);
                    const sName = cr?.subcategories?.find(s => s.id === card.subcategoryId)?.name ?? card.subcategoryId;
                    const cName = card.chapterId ? cr?.subcategories?.flatMap(s => s.chapters ?? [])?.find(ch => (typeof ch === 'string' ? ch : ch.id) === card.chapterId)?.name ?? card.chapterId : undefined;
                    return (
                      <>
                        <Badge variant="secondary" className="text-[10px]">
                          Potkategorija: {sName}
                        </Badge>
                        {cName && (
                          <Badge variant="outline" className="text-[10px] gap-1 border-primary/30">
                            <BookOpen className="h-3 w-3" />
                            Glava: {cName}
                          </Badge>
                        )}
                      </>
                    );
                  })()}
                  {!card.subcategoryId && card.chapterId && (() => {
                    const chName = allCategories.flatMap(c => (c.subcategories || []).flatMap(s => s.chapters || [])).find(ch => typeof ch === 'object' && ch.id === card.chapterId)?.name ?? card.chapterId;
                    return (
                      <Badge variant="outline" className="text-[10px] gap-1 border-primary/30">
                        <BookOpen className="h-3 w-3" />
                        Glava: {chName}
                      </Badge>
                    );
                  })()}
                  {card.sourceId && (
                    <Badge variant="outline" className="text-[10px] gap-1 border-accent">
                      <Link2 className="h-3 w-3" />
                      Povezano sa izvorom
                    </Badge>
                  )}
                  {card.needsReview && (
                    <Badge className="text-[10px] gap-1 bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30">
                      <AlertTriangle className="h-3 w-3" />
                      Izvor ažuriran
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

                <div className="flex items-center gap-2 flex-wrap">
                  {onEdit && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onEdit(card)}>
                      <Pencil className="h-3.5 w-3.5" /> Uredi
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => onOpenMoveModal(card.id)}>
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Premjesti
                  </Button>
                  {onDelete && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive hover:bg-destructive/10" onClick={() => { onDelete(card.id); toast.success("Kartica obrisana."); }}>
                      <Trash2 className="h-3.5 w-3.5" /> Obriši
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {filteredCards.length === 0 && hasActiveFilters && (
        <div className="text-center py-12 text-muted-foreground text-sm space-y-2">
          <p>Nema kartica koje odgovaraju filterima.</p>
          <Button variant="outline" size="sm" onClick={onResetFilters}>Resetuj filtere</Button>
        </div>
      )}
    </div>
  );
}
