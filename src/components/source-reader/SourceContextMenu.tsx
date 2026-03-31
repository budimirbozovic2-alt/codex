import { Heading1, Heading2, Heading3, Type, ListOrdered, List } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Props for the SourceContextMenu component.
 */
interface Props {
  /** Current position and target element for the menu */
  menu: { x: number; y: number; element: HTMLElement };
  /** Callback to set the heading level */
  onSetHeading: (level: number | null) => void;
  /** Callback to format as a list */
  onFormatAsList: (type: "ol" | "ul") => void;
  /** Callback to close the menu */
  onClose: () => void;
}

/**
 * Context menu for headings and lists, appearing on right-click in edit mode.
 */
export function SourceContextMenu({ menu, onSetHeading, onFormatAsList, onClose }: Props) {
  return (
    <div
      className="fixed z-[100] rounded-lg border bg-popover shadow-lg p-1 min-w-[180px] animate-in fade-in-0 zoom-in-95"
      style={{ left: menu.x, top: menu.y }}
      onClick={e => e.stopPropagation()}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Postavi kao</p>
      {[
        { level: 1, label: "Naslov 1 (H1)", icon: <Heading1 className="h-4 w-4" /> },
        { level: 2, label: "Naslov 2 (H2)", icon: <Heading2 className="h-4 w-4" /> },
        { level: 3, label: "Naslov 3 (H3)", icon: <Heading3 className="h-4 w-4" /> },
        { level: null, label: "Paragraf (Normalan)", icon: <Type className="h-4 w-4" /> },
      ].map(opt => {
        const currentTag = menu.element.tagName.toLowerCase();
        const isActive = opt.level ? currentTag === `h${opt.level}` : currentTag === "p";
        return (
          <button
            key={opt.level ?? "p"}
            onClick={() => onSetHeading(opt.level)}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors",
              isActive
                ? "bg-primary/10 text-primary font-medium"
                : "text-foreground hover:bg-secondary"
            )}
          >
            {opt.icon}
            {opt.label}
            {isActive && <span className="ml-auto text-[10px] text-primary">✓</span>}
          </button>
        );
      })}
      <div className="h-px bg-border my-1" />
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Liste</p>
      <button
        onClick={() => { onClose(); onFormatAsList("ol"); }}
        className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors text-foreground hover:bg-secondary"
      >
        <ListOrdered className="h-4 w-4" />
        Numerisana lista
      </button>
      <button
        onClick={() => { onClose(); onFormatAsList("ul"); }}
        className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors text-foreground hover:bg-secondary"
      >
        <List className="h-4 w-4" />
        Lista
      </button>
    </div>
  );
}
