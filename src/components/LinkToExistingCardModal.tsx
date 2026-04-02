import { useMemo, useState, useCallback } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { Card } from "@/lib/spaced-repetition";
import { useCategoryData } from "@/contexts/AppContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceId: string;
  sourceLabel: string;
  selectedText: string;
  cards: Card[];
  onLink: (cardId: string, appendSnippet: boolean) => void;
}

function SubBadge({ categoryId, subcategoryId }: { categoryId: string; subcategoryId: string }) {
  const catRecord = useLiveQuery(() => db.categories.get(categoryId), [categoryId]);
  const name = catRecord?.subcategories?.find(s => s.id === subcategoryId)?.name ?? subcategoryId;
  return <Badge variant="outline" className="text-[10px] mt-0.5">{name}</Badge>;
}

export default function LinkToExistingCardModal({
  open, onOpenChange, sourceId, sourceLabel, selectedText, cards, onLink,
}: Props) {
  const [search, setSearch] = useState("");

  // Pre-filter: unlinked, essay-only, same category
  // sourceLabel may be a category name or a source title (fallback for unmigrated sources)
  const eligible = useMemo(() =>
    cards.filter(c =>
      !c.sourceId &&
      c.type !== "flash" &&
      c.categoryId === sourceLabel
    ),
    [cards, sourceLabel]
  );

  // Search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return eligible;
    const q = search.toLowerCase();
    return eligible.filter(c => c.question.toLowerCase().includes(q));
  }, [eligible, search]);

  const handleSelect = useCallback((cardId: string, appendSnippet: boolean) => {
    onLink(cardId, appendSnippet);
    setSearch("");
  }, [onLink]);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch(""); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Poveži sa postojećim esejem</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pretraži eseje..."
              className="pl-9"
              autoFocus
            />
          </div>

          {selectedText && (
            <div className="rounded-md border bg-muted/50 p-2.5 max-h-20 overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-1">Označeni tekst:</p>
              <p className="text-xs text-foreground/80 line-clamp-3">{selectedText}</p>
            </div>
          )}

          <ScrollArea className="h-[300px]">
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-12">
                {eligible.length === 0
                  ? `Nema nepovezanih eseja u kategoriji "${sourceLabel}"`
                  : "Nema rezultata za pretragu"
                }
              </div>
            ) : (
              <div className="space-y-1 pr-3">
                {filtered.map(card => (
                  <div
                    key={card.id}
                    className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 hover:bg-accent/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{card.question}</p>
                    {card.subcategoryId && (
                        <SubBadge categoryId={card.categoryId} subcategoryId={card.subcategoryId!} />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="sm" variant="secondary" onClick={() => handleSelect(card.id, true)} title="Poveži i dodaj isječak kao sekciju">
                        Odaberi + isječak
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleSelect(card.id, false)} title="Samo poveži bez dodavanja sekcije">
                        Samo poveži
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <p className="text-xs text-muted-foreground text-center">
            {eligible.length} nepovezanih eseja u kategoriji "{sourceLabel}"
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
