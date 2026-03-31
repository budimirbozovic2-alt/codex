import { PenSquare, Link as LinkIcon, Heading1, Heading2, Heading3, Type, ListOrdered, List } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Props for the SourceTooltip component.
 */
interface Props {
  /** The position of the tooltip relative to the selection */
  selection: { x: number; y: number; text: string };
  /** Whether the reader is in edit mode */
  editMode: boolean;
  /** Callback to convert the selection to an essay card */
  onConvertToEssay: () => void;
  /** Callback to link the selection to an existing card */
  onLinkToExisting: () => void;
  /** Callback to format the selection as a specific HTML tag */
  onFormatSelectionAs: (tag: "h1" | "h2" | "h3" | "p" | "ol" | "ul") => void;
}

/**
 * Tooltip component that appears when text is selected.
 * Provides actions for creating cards, linking to cards, or formatting text in edit mode.
 */
export function SourceTooltip({ selection, editMode, onConvertToEssay, onLinkToExisting, onFormatSelectionAs }: Props) {
  return (
    <div data-source-tooltip
      className="absolute z-50 -translate-x-1/2 -translate-y-full animate-in fade-in-0 zoom-in-95 duration-150"
      style={{ left: selection.x, top: selection.y }}>
      <div className="flex items-center gap-1 mb-1">
        {editMode ? (
          <>
            {([
              { tag: "h1" as const, label: "H1", icon: <Heading1 className="h-3.5 w-3.5" /> },
              { tag: "h2" as const, label: "H2", icon: <Heading2 className="h-3.5 w-3.5" /> },
              { tag: "h3" as const, label: "H3", icon: <Heading3 className="h-3.5 w-3.5" /> },
              { tag: "p" as const, label: "¶", icon: <Type className="h-3.5 w-3.5" /> },
              { tag: "ol" as const, label: "1.", icon: <ListOrdered className="h-3.5 w-3.5" /> },
              { tag: "ul" as const, label: "•", icon: <List className="h-3.5 w-3.5" /> },
            ]).map(opt => (
              <button key={opt.tag} onClick={() => onFormatSelectionAs(opt.tag)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium shadow-lg hover:bg-secondary/80 transition-colors"
                title={opt.label}>
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </>
        ) : (
          <>
            <button onClick={onConvertToEssay}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium shadow-lg hover:bg-primary/90 transition-colors"
              title="Prečica: S">
              <PenSquare className="h-3.5 w-3.5" />
              Napravi esej
              <kbd className="text-[9px] opacity-70 ml-0.5 border border-primary-foreground/30 rounded px-1">S</kbd>
            </button>
            <button onClick={onLinkToExisting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium shadow-lg hover:bg-secondary/80 transition-colors">
              <LinkIcon className="h-3.5 w-3.5" />
              Poveži sa postojećim
            </button>
          </>
        )}
      </div>
      <div className={cn("w-2.5 h-2.5 rotate-45 mx-auto -mt-1.5", editMode ? "bg-secondary" : "bg-primary")} />
    </div>
  );
}
