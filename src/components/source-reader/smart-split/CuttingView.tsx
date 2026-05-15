import { Scissors } from "lucide-react";
import { SafeHtml } from "@/components/ui/safe-html";

interface Props {
  blocks: string[];
  onCut: (blockIndex: number) => void;
  onCancel: () => void;
}

/** Inline cutting view — operates on HTML blocks and preserves formatting. */
export function CuttingView({ blocks, onCut, onCancel }: Props) {
  if (blocks.length <= 1) {
    return (
      <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-warning">Režim rezanja</span>
          <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
            Otkaži
          </button>
        </div>
        <div className="text-sm text-muted-foreground text-center py-4">
          Nema dovoljno blokova za rezanje. Razdvojte sadržaj na više paragrafa/naslova.
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-0">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-warning">
          Kliknite na makazice — sve nakon reza postaje novi modul (format se čuva)
        </span>
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
          Otkaži
        </button>
      </div>
      {blocks.map((blk, idx) => (
        <div key={idx}>
          {idx > 0 && (
            <button
              type="button"
              onClick={() => onCut(idx)}
              className="w-full flex items-center gap-2 py-1.5 group hover:bg-warning/10 rounded transition-colors my-0.5"
              title="Podijeli ovdje"
            >
              <div className="flex-1 h-px bg-warning/30 group-hover:bg-warning" />
              <Scissors className="h-3.5 w-3.5 text-warning/50 group-hover:text-warning transition-colors rotate-90" />
              <div className="flex-1 h-px bg-warning/30 group-hover:bg-warning" />
            </button>
          )}
          <SafeHtml
            className="text-sm px-2 py-1 rounded prose prose-sm max-w-none dark:prose-invert"
            html={blk}
          />
        </div>
      ))}
    </div>
  );
}
