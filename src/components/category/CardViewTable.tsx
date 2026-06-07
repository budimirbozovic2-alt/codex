import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { type Card } from "@/lib/spaced-repetition";
import type { FrequencyTag } from "@/lib/sr/types";
import type { CategoryRecord } from "@/lib/db-types";
import { CardTableRow } from "./CardTableRow";

interface Props {
  filteredCards: Card[];
  allCategories: CategoryRecord[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  setFrequency: (cardId: string, value: FrequencyTag | null) => void;
  onEdit?: (card: Card) => void;
  onPassiveRead?: (card: Card) => void;
  onDelete?: (id: string) => void;
  onOpenMoveModal: (cardId: string) => void;
  hasActiveFilters: boolean;
  totalCount: number;
  onResetFilters: () => void;
}

export default function CardViewTable({
  filteredCards, allCategories, expandedId, onToggle,
  selectionMode, selectedIds, onToggleSelection,
  setFrequency, onEdit, onPassiveRead, onDelete, onOpenMoveModal,
  hasActiveFilters, totalCount: _totalCount, onResetFilters,
}: Props) {
  
  // PR-G6 / RC-6: Hoistovan lookup taksonomije iznad petlje.
  const { subNameById, chapNameById } = useMemo(() => {
    const subs = new Map<string, string>();
    const chaps = new Map<string, string>();
    for (const c of allCategories) {
      for (const s of c.subcategories ?? []) {
        subs.set(s.id, s.name);
        for (const ch of s.chapters ?? []) {
          if (typeof ch !== "string") chaps.set(ch.id, ch.name);
        }
      }
    }
    return { subNameById: subs, chapNameById: chaps };
  }, [allCategories]);

  return (
    <div className="space-y-1">
      {filteredCards.map(card => {
        const subId = card.subcategoryId;
        const chId = card.chapterId;
        const subName = subId ? subNameById.get(subId) : undefined;
        const chapName = chId ? chapNameById.get(chId) : undefined;

        // PR-H5 Optimizacija: Prosljedjujemo primitive umjesto
        // objekta, cime cuvamo referentni integritet React.memo
        return (
          <CardTableRow
            key={card.id}
            card={card}
            isExpanded={expandedId === card.id}
            isSelected={selectedIds.has(card.id)}
            selectionMode={selectionMode}
            subName={subName}
            subStale={!!subId && !subName}
            chapName={chapName}
            chapStale={!!chId && !chapName}
            onToggle={onToggle}
            onToggleSelection={onToggleSelection}
            setFrequency={setFrequency}
            onEdit={onEdit}
            onPassiveRead={onPassiveRead}
            onDelete={onDelete}
            onOpenMoveModal={onOpenMoveModal}
          />
        );
      })}

      {filteredCards.length === 0 && hasActiveFilters && (
        <div className="text-center py-12 text-sm space-y-2 text-muted-foreground">
          <p>Nema kartica koje odgovaraju filterima.</p>
          <Button variant="outline" size="sm" onClick={onResetFilters}>
            Resetuj filtere
          </Button>
        </div>
      )}
    </div>
  );
}