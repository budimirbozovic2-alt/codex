import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { type Card } from "@/lib/spaced-repetition";
import type { FrequencyTag } from "@/lib/sr/types";
import type { CategoryRecord } from "@/lib/db-types";
import { CardTableRow, type CardTaxonomyResolved } from "./CardTableRow";

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

const EMPTY_TAXONOMY: CardTaxonomyResolved = {
  subName: undefined, subStale: false, chapName: undefined, chapStale: false,
};

export default function CardViewTable({
  filteredCards, allCategories, expandedId, onToggle,
  selectionMode, selectedIds, onToggleSelection,
  setFrequency, onEdit, onPassiveRead, onDelete, onOpenMoveModal,
  hasActiveFilters, totalCount: _totalCount, onResetFilters,
}: Props) {
  // PR-G6 / RC-6: hoist taxonomy lookups out of the per-row IIFEs.
  // Building these once is O(N) over the category tree; the previous code
  // ran `allCategories.find(...)` + `.flatMap(...).find(...)` inside every
  // row body on every render — O(N×M) per repaint.
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

  // Memoize per-card taxonomy props so that referential equality holds
  // across re-renders (the row's `React.memo` comparator depends on it).
  const taxonomyByCardId = useMemo(() => {
    const map = new Map<string, CardTaxonomyResolved>();
    for (const card of filteredCards) {
      const subId = card.subcategoryId;
      const chId = card.chapterId;
      const subName = subId ? subNameById.get(subId) : undefined;
      const chapName = chId ? chapNameById.get(chId) : undefined;
      const resolved: CardTaxonomyResolved = {
        subName,
        subStale: !!subId && !subName,
        chapName,
        chapStale: !!chId && !chapName,
      };
      map.set(card.id, resolved);
    }
    return map;
  }, [filteredCards, subNameById, chapNameById]);

  return (
    <div className="space-y-1">
      {filteredCards.map(card => (
        <CardTableRow
          key={card.id}
          card={card}
          isExpanded={expandedId === card.id}
          isSelected={selectedIds.has(card.id)}
          selectionMode={selectionMode}
          taxonomy={taxonomyByCardId.get(card.id) ?? EMPTY_TAXONOMY}
          onToggle={onToggle}
          onToggleSelection={onToggleSelection}
          setFrequency={setFrequency}
          onEdit={onEdit}
          onPassiveRead={onPassiveRead}
          onDelete={onDelete}
          onOpenMoveModal={onOpenMoveModal}
        />
      ))}

      {filteredCards.length === 0 && hasActiveFilters && (
        <div className="text-center py-12 text-muted-foreground text-sm space-y-2">
          <p>Nema kartica koje odgovaraju filterima.</p>
          <Button variant="outline" size="sm" onClick={onResetFilters}>Resetuj filtere</Button>
        </div>
      )}
    </div>
  );
}
