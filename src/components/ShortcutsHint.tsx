import { useState } from "react";
import { default as Keyboard } from "lucide-react/dist/esm/icons/keyboard";
import { default as X } from "lucide-react/dist/esm/icons/x";

interface Shortcut {
  keys: string;
  description: string;
}

interface Props {
  shortcuts: Shortcut[];
}

export default function ShortcutsHint({ shortcuts }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary transition-colors"
        title="Prečice na tastaturi"
      >
        <Keyboard className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl border bg-popover p-3 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prečice</span>
              <button onClick={() => setOpen(false)} className="p-0.5 rounded hover:bg-secondary text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1.5">
              {shortcuts.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{s.description}</span>
                  <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border shrink-0">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
