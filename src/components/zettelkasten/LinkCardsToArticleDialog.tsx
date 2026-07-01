import { useState, useMemo, useCallback, useEffect } from "react";
import { Search, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Card } from "@/lib/spaced-repetition";
import { cn } from "@/lib/utils";
import { afterDialogClose } from "@/lib/dialog-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articleTitle: string;
  /** Subject cards not yet linked to this article (candidates). */
  candidates: Card[];
  /** Persist the chosen links. */
  onLink: (cardIds: string[]) => void;
}

/**
 * Multi-select picker that attaches existing subject cards to the active
 * Zettelkasten article. Mirrors AttachEssayDialog, inverted: from the article
 * side you pick cards instead of from the card side picking an essay.
 */
export function LinkCardsToArticleDialog({
  open,
  onOpenChange,
  articleTitle,
  candidates,
  onLink,
}: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(new Set());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      (c.question || "").toLowerCase().includes(q),
    );
  }, [candidates, query]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const confirm = useCallback(() => {
    if (selected.size === 0) return;
    const ids = [...selected];
    onOpenChange(false);
    afterDialogClose(() => onLink(ids));
  }, [selected, onLink, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Poveži kartice s pojmom</DialogTitle>
          <DialogDescription>
            Izaberite kartice koje obrađuju „{articleTitle.slice(0, 60)}
            {articleTitle.length > 60 ? "…" : ""}".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pretraži kartice…"
              className="pl-8 h-9 text-sm"
              autoFocus
            />
          </div>

          <ul
            className="max-h-64 overflow-y-auto rounded-lg border divide-y"
            role="listbox"
            aria-label="Kartice predmeta"
            aria-multiselectable="true"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                {candidates.length === 0
                  ? "Sve kartice predmeta su već povezane ili ih nema."
                  : "Nema kartica koje odgovaraju pretrazi."}
              </li>
            ) : (
              filtered.map((card) => {
                const isSelected = selected.has(card.id);
                return (
                  <li key={card.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => toggle(card.id)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 text-sm hover:bg-accent/50 transition-colors flex items-center gap-2",
                        isSelected && "bg-primary/5",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          isSelected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/40",
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </span>
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="line-clamp-2 flex-1">
                        {card.question || "(Bez pitanja)"}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {card.type === "flash" ? "blic" : "esej"}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Otkaži
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={confirm}
              disabled={selected.size === 0}
            >
              Poveži ({selected.size})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default LinkCardsToArticleDialog;
