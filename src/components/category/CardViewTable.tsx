import { useMemo } from "react";
import { List, type RowComponentProps } from "react-window";
import { Button } from "@/components/ui/button";
import { type Card } from "@/lib/spaced-repetition";
import type { FrequencyTag } from "@/lib/sr/types";
import type { CategoryRecord } from "@/lib/db-types";
import { CardTableRow } from "./CardTableRow";
import { VIRTUALIZATION_THRESHOLD } from "./org-mode/VirtualSortableCardList";

const ROW_HEIGHT = 52;
const ROW_GAP = 4;
const ITEM_SIZE = ROW_HEIGHT + ROW_GAP;
const MAX_VIRTUAL_HEIGHT = 640;

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

interface RowData {
  filteredCards: Card[];
  subNameById: Map<string, string>;
  chapNameById: Map<string, string>;
  expandedId: string | null;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleSelection: (id: string) => void;
  setFrequency: (cardId: string, value: FrequencyTag | null) => void;
  onEdit?: (card: Card) => void;
  onPassiveRead?: (card: Card) => void;
  onDelete?: (id: string) => void;
  onOpenMoveModal: (cardId: string) => void;
}

function CardTableVirtualRow({ index, style, ...rowData }: RowComponentProps<RowData>) {
  const card = rowData.filteredCards[index];
  if (!card) return null;
  const subId = card.subcategoryId;
  const chId = card.chapterId;
  const subName = subId ? rowData.subNameById.get(subId) : undefined;
  const chapName = chId ? rowData.chapNameById.get(chId) : undefined;

  return (
    <div style={{ ...style, paddingBottom: ROW_GAP }}>
      <CardTableRow
        card={card}
        isExpanded={rowData.expandedId === card.id}
        isSelected={rowData.selectedIds.has(card.id)}
        selectionMode={rowData.selectionMode}
        subName={subName}
        subStale={!!subId && !subName}
        chapName={chapName}
        chapStale={!!chId && !chapName}
        onToggle={rowData.onToggle}
        onToggleSelection={rowData.onToggleSelection}
        setFrequency={rowData.setFrequency}
        onEdit={rowData.onEdit}
        onPassiveRead={rowData.onPassiveRead}
        onDelete={rowData.onDelete}
        onOpenMoveModal={rowData.onOpenMoveModal}
      />
    </div>
  );
}

export default function CardViewTable({
  filteredCards, allCategories, expandedId, onToggle,
  selectionMode, selectedIds, onToggleSelection,
  setFrequency, onEdit, onPassiveRead, onDelete, onOpenMoveModal,
  hasActiveFilters, totalCount: _totalCount, onResetFilters,
}: Props) {

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

  const rowProps = useMemo<RowData>(() => ({
    filteredCards,
    subNameById,
    chapNameById,
    expandedId,
    selectionMode,
    selectedIds,
    onToggle,
    onToggleSelection,
    setFrequency,
    onEdit,
    onPassiveRead,
    onDelete,
    onOpenMoveModal,
  }), [
    filteredCards, subNameById, chapNameById, expandedId, selectionMode, selectedIds,
    onToggle, onToggleSelection, setFrequency, onEdit, onPassiveRead, onDelete, onOpenMoveModal,
  ]);

  // react-window assigns each row a fixed height, so an expanded preview would
  // overflow its slot and paint over the rows below instead of pushing them
  // down. While a row is expanded we fall back to flow layout (rows already
  // carry `content-visibility: auto` for off-screen perf) so expansion grows
  // the list naturally; virtualization resumes once collapsed.
  const useVirtual = filteredCards.length > VIRTUALIZATION_THRESHOLD && !expandedId;
  const virtualHeight = Math.min(filteredCards.length * ITEM_SIZE, MAX_VIRTUAL_HEIGHT);

  return (
    <div className="space-y-1">
      {useVirtual ? (
        <List
          rowCount={filteredCards.length}
          rowHeight={ITEM_SIZE}
          rowComponent={CardTableVirtualRow}
          rowProps={rowProps}
          overscanCount={6}
          style={{ height: virtualHeight, width: "100%" }}
        />
      ) : (
        filteredCards.map(card => {
          const subId = card.subcategoryId;
          const chId = card.chapterId;
          const subName = subId ? subNameById.get(subId) : undefined;
          const chapName = chId ? chapNameById.get(chId) : undefined;

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
        })
      )}

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
