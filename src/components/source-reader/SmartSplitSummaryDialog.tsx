import { Wand2, PenSquare, ChevronUp, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Source } from "@/lib/sources-storage";
import type { SelectionModule } from "@/lib/selection-split-engine";

/**
 * Props for the SmartSplitSummaryDialog component.
 */
interface Props {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the open state changes */
  onOpenChange: (open: boolean) => void;
  /** Whether the split operation is complete */
  splitDone: boolean;
  /** The result of the split analysis */
  splitResult: { modules: SelectionModule[]; rangeLabel: string; parentName: string } | null;
  /** Number of cards created during the split */
  splitCreatedCount: number;
  /** The source being read */
  source: Source;
  /** The parent name for the newly created cards */
  splitParentName: string;
  /** Callback to update the parent name */
  setSplitParentName: (val: string) => void;
  /** The modules detected in the split */
  splitModules: SelectionModule[];
  /** Callback to update the modules */
  setSplitModules: (updater: (prev: SelectionModule[]) => SelectionModule[]) => void;
  /** Callback to confirm the smart split */
  onSmartSplitConfirm: () => void;
}

/**
 * Dialog that shows a preview of the "Smart-Split" operation, allowing users to rename modules and the parent card.
 */
export function SmartSplitSummaryDialog({
  open, onOpenChange, splitDone, splitResult, splitCreatedCount,
  source, splitParentName, setSplitParentName, splitModules,
  setSplitModules, onSmartSplitConfirm
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            {splitDone ? "Generisanje završeno" : "Smart-Split pregled"}
          </DialogTitle>
        </DialogHeader>
        {splitDone ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4">
              <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center">
                <PenSquare className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Uspješno generisano 1 esejsko pitanje sa {splitCreatedCount} modula</p>
                <p className="text-xs text-muted-foreground mt-0.5">{splitResult?.rangeLabel} • Izvor: "{source.title}"</p>
              </div>
            </div>
            <Button onClick={() => onOpenChange(false)} className="w-full">Zatvori</Button>
          </div>
        ) : splitResult ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Naslov eseja</label>
              <input value={splitParentName} onChange={e => setSplitParentName(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Unesite naslov eseja..." />
            </div>
            <div className="rounded-lg border bg-muted/50 px-4 py-3">
              <p className="text-sm">Detektovano <strong className="text-foreground">{splitResult.modules.length}</strong> članova ({splitResult.rangeLabel})</p>
              <p className="text-xs text-muted-foreground mt-1">Biće kreiran 1 esejsko pitanje sa {splitResult.modules.length} modula (cjelina).</p>
            </div>
            <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
              {splitModules.map((mod, i) => (
                <div key={`${mod.articleNum}-${i}`} className="group flex items-start gap-1.5 rounded-md border bg-card px-2 py-2">
                  <div className="flex flex-col gap-0.5 flex-shrink-0 mt-0.5">
                    <button disabled={i === 0}
                      onClick={() => setSplitModules(prev => { const arr = [...prev]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; return arr; })}
                      className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors" title="Pomjeri gore">
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button disabled={i === splitModules.length - 1}
                      onClick={() => setSplitModules(prev => { const arr = [...prev]; [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; return arr; })}
                      className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors" title="Pomjeri dolje">
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                  <Badge variant="outline" className="text-[10px] mt-1 flex-shrink-0">{i + 1}</Badge>
                  <div className="min-w-0 flex-1">
                    <input value={mod.title}
                      onChange={e => { const val = e.target.value; setSplitModules(prev => prev.map((m, j) => j === i ? { ...m, title: val } : m)); }}
                      className="w-full text-sm font-medium bg-transparent border-b border-transparent hover:border-border focus:border-ring focus:outline-none px-0 py-0.5 transition-colors"
                      title="Klikni za editovanje naslova" />
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {mod.contentText.slice(0, 100)}{mod.contentText.length > 100 ? "..." : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <Badge variant="outline" className="text-[10px]">Backlink</Badge>
              <span>Svi moduli će biti automatski povezani sa izvorom "{source.title}"</span>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Otkaži</Button>
              <Button onClick={onSmartSplitConfirm} className="flex-1 gap-2">
                <Wand2 className="h-4 w-4" />Potvrdi
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
