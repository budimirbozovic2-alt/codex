import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type DiffResult, type ArticleDiff } from "@/lib/article-parser";
import { cn } from "@/lib/utils";

interface Props {
  diffResult: DiffResult;
  affectedCardCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const STATUS_CONFIG: Record<ArticleDiff["status"], { label: string; color: string; bg: string }> = {
  modified: { label: "Izmijenjen", color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
  added: { label: "Dodat", color: "text-green-700 dark:text-green-400", bg: "bg-green-500/10 border-green-500/30" },
  removed: { label: "Uklonjen", color: "text-red-700 dark:text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  unchanged: { label: "Nepromijenjen", color: "text-muted-foreground", bg: "bg-muted/30 border-border" },
};

export default function SourceDiffPreview({ diffResult, affectedCardCount, onConfirm, onCancel }: Props) {
  const { summary, diffs } = diffResult;
  const changedDiffs = diffs.filter(d => d.status !== "unchanged");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Pregled izmjena izvora</DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="flex flex-wrap gap-2">
          {summary.modified > 0 && <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">{summary.modified} izmijenjeno</Badge>}
          {summary.added > 0 && <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">{summary.added} dodato</Badge>}
          {summary.removed > 0 && <Badge className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30">{summary.removed} uklonjeno</Badge>}
          <Badge variant="outline">{summary.unchanged} nepromijenjeno</Badge>
        </div>

        {affectedCardCount > 0 && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
            ⚠ <strong>{affectedCardCount}</strong> kartica će biti označeno za provjeru jer su povezane sa izmijenjenim članovima.
          </div>
        )}

        {/* Changed articles */}
        <ScrollArea className="flex-1 min-h-0 max-h-[40vh]">
          <div className="space-y-2 pr-3">
            {changedDiffs.map((diff) => {
              const cfg = STATUS_CONFIG[diff.status];
              return (
                <div key={diff.articleId} className={cn("rounded-lg border p-3 space-y-1.5", cfg.bg)}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{diff.articleTitle}</span>
                    <Badge variant="outline" className={cn("text-[10px]", cfg.color)}>{cfg.label}</Badge>
                  </div>
                  {diff.status === "modified" && diff.segments && (
                    <div className="text-xs leading-relaxed font-mono bg-background/50 rounded p-2 max-h-32 overflow-y-auto">
                      {diff.segments.map((seg, i) => (
                        <span
                          key={i}
                          className={cn(
                            seg.type === "insert" && "bg-green-500/20 text-green-700 dark:text-green-300",
                            seg.type === "delete" && "bg-red-500/20 text-red-700 dark:text-red-300 line-through",
                          )}
                        >
                          {seg.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {changedDiffs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nema izmjena u člancima.</p>
            )}
          </div>
        </ScrollArea>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onCancel}>Otkaži</Button>
          <Button onClick={onConfirm}>Potvrdi i sačuvaj</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
