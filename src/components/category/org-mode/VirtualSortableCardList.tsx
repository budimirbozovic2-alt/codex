/**
 * PR-G5 follow-up — virtualized DnD list for chapter cards.
 *
 * Wraps `react-window` v2 `<List />` inside `<SortableContext />` so that
 * dnd-kit retains awareness of the FULL ordered ID list even when most
 * rows are unmounted by the virtualizer. The DragOverlay shim lives in
 * `CardOrgMode` (already mounted at `document.body`), so the ghost
 * survives the source row being scrolled out.
 *
 * Activation: only when `cards.length > VIRTUALIZATION_THRESHOLD`. Below
 * the threshold we render inline — virtualization overhead (constant
 * scroll-driven mount/unmount + dnd-kit `MeasuringStrategy.Always`
 * re-measurement) is not worth it for short lists.
 *
 * Compatibility notes (the "shim"):
 *  1. `SortableContext` receives `cards.map(c => c.id)` — all ids, not just
 *     visible ones. This keeps `arrayMove`/index math correct.
 *  2. `<DragOverlay />` is rendered by the parent `CardOrgMode` via
 *     `createPortal(..., document.body)`, so the ghost outlives row unmount.
 *  3. `overscanCount={8}` keeps a comfortable buffer for cross-row drag
 *     drops near the visible edge before dnd-kit's auto-scroll kicks in.
 *  4. dnd-kit's `useAutoScroll` detects the `<List />`'s own scrollable
 *     viewport as a scroll ancestor, so dragging near top/bottom edges
 *     auto-scrolls and unmounted rows mount on demand.
 */
import { memo, useMemo } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { List, type RowComponentProps } from "react-window";
import { type Card } from "@/lib/spaced-repetition";
import { SortableCardTile } from "./OrgCardTiles";

/** Row tile height (~py-2 + content) plus gap. Tuned against `SortableCardTile`. */
const ROW_HEIGHT = 44;
const ROW_GAP = 6;
const ITEM_SIZE = ROW_HEIGHT + ROW_GAP;
/** Below this count, virtualization adds more overhead than it saves. */
export const VIRTUALIZATION_THRESHOLD = 30;
/** Hard cap on viewport height — chapters never blow past this in the panel. */
const MAX_VIRTUAL_HEIGHT = 480;

interface RowData {
  cards: Card[];
}

function CardRow({ index, style, cards }: RowComponentProps<RowData>) {
  const card = cards[index];
  if (!card) return null;
  return (
    <div style={{ ...style, paddingBottom: ROW_GAP }}>
      <SortableCardTile card={card} index={index} />
    </div>
  );
}

interface Props {
  cards: Card[];
}

function VirtualSortableCardListInner({ cards }: Props) {
  const ids = useMemo(() => cards.map(c => c.id), [cards]);
  const rowProps = useMemo<RowData>(() => ({ cards }), [cards]);
  const height = Math.min(cards.length * ITEM_SIZE, MAX_VIRTUAL_HEIGHT);

  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <List
        rowCount={cards.length}
        rowHeight={ITEM_SIZE}
        rowComponent={CardRow}
        rowProps={rowProps}
        overscanCount={8}
        style={{ height, width: "100%" }}
      />
    </SortableContext>
  );
}

export const VirtualSortableCardList = memo(VirtualSortableCardListInner);
