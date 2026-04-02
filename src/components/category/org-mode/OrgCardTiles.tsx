import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, BookOpen, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Card } from "@/lib/spaced-repetition";
import { cn } from "@/lib/utils";
import { chapterDropId } from "./org-mode-utils";

// ─── Sortable card tile ─────────────────────────────────
export function SortableCardTile({ card, index }: { card: Card; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 group hover:border-primary/30 hover:shadow-sm transition-all"
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground opacity-40 group-hover:opacity-80 transition-opacity shrink-0"
      >
        <GripVertical className="h-4 w-4" />
      </span>
      <span className="text-[11px] text-muted-foreground tabular-nums w-6 text-right shrink-0">{index + 1}.</span>
      <span className="text-sm text-foreground truncate flex-1">{card.question || "(Bez pitanja)"}</span>
      <Badge variant="outline" className="text-[9px] shrink-0 opacity-60">
        {card.type === "flash" ? "Blic" : "Esej"}
      </Badge>
    </div>
  );
}

// ─── Droppable chapter zone ─────────────────────────────
export function DroppableChapterZone({ subId, chapId, displayName, count, children }: {
  subId: string; chapId: string; displayName: string; count: number; children: React.ReactNode;
}) {
  const dropId = chapterDropId(subId, chapId);
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border border-dashed p-3 space-y-2 transition-all",
        isOver
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border/60 bg-muted/20"
      )}
    >
      <div className="flex items-center gap-2 px-1">
        <BookOpen className="h-3.5 w-3.5 text-primary/60" />
        <span className="text-xs font-semibold text-foreground/80">{displayName}</span>
        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 ml-auto">{count}</Badge>
      </div>
      <div className="space-y-1.5">
        {children}
      </div>
    </div>
  );
}

// ─── Drag overlay (ghost) ───────────────────────────────
export function CardDragOverlay({ card }: { card: Card }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border-2 border-primary/40 bg-card shadow-2xl px-4 py-2.5 w-80 pointer-events-none">
      <GripVertical className="h-4 w-4 text-primary shrink-0" />
      <span className="text-sm text-foreground truncate flex-1">{card.question || "(Bez pitanja)"}</span>
    </div>
  );
}

// ─── Unassigned card with assign controls ───────────────
export function UnassignedCardRow({
  card, index, availableChapters, otherSubs, onAssignChapter, onMoveSub,
}: {
  card: Card; index: number;
  availableChapters: string[]; otherSubs: string[];
  onAssignChapter: (v: string) => void;
  onMoveSub: (v: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 group">
      <div className="flex-1 flex items-center gap-3 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2 hover:border-orange-500/40 transition-all">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground opacity-40 group-hover:opacity-80 transition-opacity shrink-0"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums w-6 text-right shrink-0">{index + 1}.</span>
        <span className="text-sm text-foreground truncate flex-1">{card.question || "(Bez pitanja)"}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {availableChapters.length > 0 && (
          <Select onValueChange={onAssignChapter}>
            <SelectTrigger className="h-7 w-32 text-[10px] border-dashed">
              <SelectValue placeholder="→ Glava" />
            </SelectTrigger>
            <SelectContent>
              {availableChapters.map(ch => (
                <SelectItem key={ch} value={ch} className="text-xs">{ch}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {otherSubs.length > 0 && (
          <Select onValueChange={onMoveSub}>
            <SelectTrigger className="h-7 w-32 text-[10px] border-dashed">
              <SelectValue placeholder="→ Potkat." />
            </SelectTrigger>
            <SelectContent>
              {otherSubs.map(s => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
