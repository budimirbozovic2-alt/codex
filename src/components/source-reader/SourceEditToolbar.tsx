import { Bold, Italic, Underline, Strikethrough, Heading1, Heading2, Heading3, Type, ListOrdered, List, Paintbrush, Undo2, Redo2 } from "lucide-react";
import { memo, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Props {
  onFormat: (command: string, value?: string) => void;
}

const buttons = [
  { cmd: "bold", icon: Bold, label: "Bolduj (Ctrl+B)", group: "inline" },
  { cmd: "italic", icon: Italic, label: "Kurziv (Ctrl+I)", group: "inline" },
  { cmd: "underline", icon: Underline, label: "Podvučeno (Ctrl+U)", group: "inline" },
  { cmd: "strikethrough", icon: Strikethrough, label: "Precrtano", group: "inline" },
  { cmd: "red", icon: Paintbrush, label: "Crvena boja", group: "inline", hoverClass: "hover:text-destructive" },
  { cmd: "divider1", icon: null, label: "", group: "divider" },
  { cmd: "formatBlock:h1", icon: Heading1, label: "Naslov 1", group: "block" },
  { cmd: "formatBlock:h2", icon: Heading2, label: "Naslov 2", group: "block" },
  { cmd: "formatBlock:h3", icon: Heading3, label: "Naslov 3", group: "block" },
  { cmd: "formatBlock:p", icon: Type, label: "Paragraf", group: "block" },
  { cmd: "divider2", icon: null, label: "", group: "divider" },
  { cmd: "insertUnorderedList", icon: List, label: "Lista", group: "list" },
  { cmd: "insertOrderedList", icon: ListOrdered, label: "Numerisana lista", group: "list" },
  { cmd: "divider3", icon: null, label: "", group: "divider" },
  { cmd: "undo", icon: Undo2, label: "Poništi (Ctrl+Z)", group: "history" },
  { cmd: "redo", icon: Redo2, label: "Ponovi (Ctrl+Y)", group: "history" },
] as const;

export const SourceEditToolbar = memo(function SourceEditToolbar({ onFormat }: Props) {
  const handleClick = useCallback((cmd: string) => {
    if (cmd === "red") {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const parentEl = selection.anchorNode?.parentElement;
      const isRed = parentEl?.style.color === "red" || parentEl?.style.color === "rgb(239, 68, 68)";
      if (isRed && parentEl) {
        const text = document.createTextNode(parentEl.textContent || "");
        parentEl.replaceWith(text);
        onFormat("noop");
      } else {
        onFormat("foreColor", "#ef4444");
      }
      return;
    }
    if (cmd.startsWith("formatBlock:")) {
      const tag = cmd.split(":")[1];
      onFormat("formatBlock", tag === "p" ? "p" : tag);
      return;
    }
    onFormat(cmd);
  }, [onFormat]);

  return (
    <div className="sticky top-0 z-20 flex items-center gap-0.5 px-2 py-1.5 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-sm flex-wrap">
      {buttons.map((btn) => {
        if (btn.group === "divider") {
          return <div key={btn.cmd} className="w-px h-5 bg-border mx-1" />;
        }
        const Icon = btn.icon!;
        return (
          <button
            key={btn.cmd}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleClick(btn.cmd)}
            className={cn(
              "p-1.5 rounded-md text-muted-foreground transition-colors",
              (btn as any).hoverClass || "hover:text-foreground hover:bg-secondary"
            )}
            title={btn.label}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
      <span className="ml-auto text-[10px] text-muted-foreground/50 select-none hidden sm:block">
        Ctrl+B/I/U · Desni klik za strukturu
      </span>
    </div>
  );
});
