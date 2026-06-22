import { useState, useMemo, useCallback, useEffect } from "react";
import { Search, Link2, Unlink, AlertTriangle } from "lucide-react";
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
import { ENDANGERED_CONCEPT_LABEL } from "@/lib/saga/endangered-display";
import {
  previewEssaySatelliteLoad,
  SATELLITE_OVERLOAD_THRESHOLD,
} from "@/lib/saga/saga-attach";
import { cn } from "@/lib/utils";
import { afterDialogClose } from "@/lib/dialog-utils";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** One or more flash cards to attach (bulk supported). */
  flashCards: Card[];
  allCards: Card[];
  essayCandidates: Card[];
  onAttach: (flashIds: string[], parentId: string | undefined) => void;
}

function SatelliteLoadHint({
  allCards,
  essayId,
  flashIds,
}: {
  allCards: Card[];
  essayId: string;
  flashIds: string[];
}) {
  const load = previewEssaySatelliteLoad(allCards, essayId, flashIds);
  if (load.current === 0 && load.newAttachments === 0) return null;

  return (
    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1">
      {load.current > 0 && (
        <span>{load.current} blic{load.current === 1 ? "" : "a"}</span>
      )}
      {load.newAttachments > 0 && (
        <span className={load.isOverloaded ? "text-warning font-medium" : ""}>
          {load.current > 0 ? "→ " : ""}
          {load.afterAttach} nakon priključivanja
        </span>
      )}
      {load.isOverloaded && (
        <span className="inline-flex items-center gap-0.5 text-warning">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          preopterećen koncept (&gt;{SATELLITE_OVERLOAD_THRESHOLD})
        </span>
      )}
    </span>
  );
}

export function AttachEssayDialog({
  open,
  onOpenChange,
  flashCards,
  allCards,
  essayCandidates,
  onAttach,
}: Props) {
  const [query, setQuery] = useState("");
  const isBulk = flashCards.length > 1;
  const flashIds = useMemo(() => flashCards.map((c) => c.id), [flashCards]);

  useEffect(() => {
    if (open) setQuery("");
  }, [open, flashIds.join(",")]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const essays = essayCandidates.filter((c) => c.type === "essay");
    if (!q) return essays;
    return essays.filter((c) =>
      (c.question || "").toLowerCase().includes(q),
    );
  }, [essayCandidates, query]);

  const sharedParentId = useMemo(() => {
    if (flashCards.length === 0) return undefined;
    const first = flashCards[0]?.parentId;
    if (!first) return undefined;
    return flashCards.every((c) => c.parentId === first) ? first : undefined;
  }, [flashCards]);

  const currentParent = useMemo(
    () =>
      sharedParentId
        ? essayCandidates.find((c) => c.id === sharedParentId)
        : undefined,
    [sharedParentId, essayCandidates],
  );

  const handleSelect = useCallback(
    (essayId: string) => {
      if (flashCards.length === 0) return;
      const ids = flashIds;
      onOpenChange(false);
      afterDialogClose(() => {
        onAttach(ids, essayId);
        toast.success(
          isBulk
            ? `${ids.length} blic kartica priključeno eseju.`
            : "Blic pitanje priključeno eseju.",
        );
      });
    },
    [flashCards.length, flashIds, isBulk, onAttach, onOpenChange],
  );

  const handleDetach = useCallback(() => {
    if (!sharedParentId || flashCards.length === 0) return;
    const ids = flashIds;
    onOpenChange(false);
    afterDialogClose(() => {
      onAttach(ids, undefined);
      toast.success(
        isBulk
          ? `Veza uklonjena sa ${ids.length} blic kartica.`
          : "Veza sa esejem uklonjena.",
      );
    });
  }, [sharedParentId, flashCards.length, flashIds, isBulk, onAttach, onOpenChange]);

  const description = useMemo(() => {
    if (isBulk) {
      return `Odaberite esej roditelja za ${flashCards.length} izabranih blic kartica.`;
    }
    const q = flashCards[0]?.question;
    return q
      ? `Blic: „${q.slice(0, 80)}${q.length > 80 ? "…" : ""}"`
      : "Odaberite esej roditelja za ovo blic pitanje.";
  }, [flashCards, isBulk]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isBulk ? "Priključi blic kartice eseju" : "Priključi postojećem esejskom pitanju"}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {currentParent && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate flex-1">
                Trenutno: {currentParent.question || "(Bez pitanja)"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 shrink-0"
                onClick={handleDetach}
              >
                <Unlink className="h-3 w-3" /> Ukloni
              </Button>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pretraži eseje…"
              className="pl-8 h-9 text-sm"
              autoFocus
            />
          </div>

          <ul
            className="max-h-64 overflow-y-auto rounded-lg border divide-y"
            role="listbox"
            aria-label="Esejska pitanja"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nema eseja koji odgovaraju pretrazi.
              </li>
            ) : (
              filtered.map((essay) => {
                const allAttached = flashCards.every((f) => f.parentId === essay.id);
                const load = previewEssaySatelliteLoad(allCards, essay.id, flashIds);
                return (
                  <li key={essay.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={allAttached}
                      onClick={() => handleSelect(essay.id)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 text-sm hover:bg-accent/50 transition-colors",
                        allAttached && "bg-primary/5",
                        load.isOverloaded && !allAttached && "hover:bg-warning/5",
                      )}
                    >
                      <span className="line-clamp-2">
                        {essay.question || "(Bez pitanja)"}
                      </span>
                      <SatelliteLoadHint
                        allCards={allCards}
                        essayId={essay.id}
                        flashIds={flashIds}
                      />
                      {essay.isEndangered && (
                        <span className="text-[10px] text-warning mt-0.5 block">
                          {ENDANGERED_CONCEPT_LABEL}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
