import { GripVertical } from "lucide-react";
import React from "react";
import { Card } from "@/lib/spaced-repetition";
import { getCardMasteryLevel, getMasteryColor, MASTERY_LEVELS } from "@/components/KnowledgeMap";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Mode } from "./types";

interface DraggableCardTileProps {
  card: Card;
  mode: Mode;
  onClick: () => void;
}

function DraggableCardTileInner({ card, mode, onClick }: DraggableCardTileProps) {
  const level = getCardMasteryLevel(card);
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: card.id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const bgColor = mode === "navigator"
    ? "hsl(var(--secondary))"
    : getMasteryColor(level);

  const hasErrors = (card.errorLog?.length || 0) > 0;
  const shortTitle = card.question.length > 18 ? card.question.slice(0, 16) + "…" : card.question;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          className="relative group"
        >
          <button
            onClick={onClick}
            className="w-full h-full min-h-[2.75rem] px-2 py-1.5 rounded-lg text-[10px] font-medium leading-tight transition-all hover:scale-105 hover:shadow-md flex items-center gap-1"
            style={{
              backgroundColor: bgColor,
              color: mode === "navigator" ? "hsl(var(--foreground))" : "#fff",
            }}
          >
            {mode === "navigator" && (
              <span
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="h-3 w-3" />
              </span>
            )}
            <span className="truncate flex-1 text-left">{shortTitle}</span>
          </button>
          {hasErrors && mode === "auditor" && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-destructive border border-background" />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px]">
        <p className="font-medium text-xs">{card.question}</p>
        {mode === "auditor" && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {MASTERY_LEVELS[level].label} — Stabilnost: {(card.sections.reduce((s, sec) => s + sec.stability, 0) / card.sections.length).toFixed(1)}d
          </p>
        )}
        {mode === "navigator" && (
          <p className="text-[10px] text-muted-foreground mt-0.5">Klikni za učenje • Drži za pomjeranje</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

const DraggableCardTile = React.memo(DraggableCardTileInner, (prev, next) => {
  return (
    prev.card.id === next.card.id &&
    prev.mode === next.mode &&
    prev.card.sections === next.card.sections &&
    prev.card.errorLog === next.card.errorLog &&
    prev.card.question === next.card.question
  );
});

export default DraggableCardTile;
