import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type DiffResult, type ArticleDiff } from "@/lib/article-parser";
import { cn } from "@/lib/utils";
import { afterDialogClose } from "@/lib/dialog-utils";

interface Props {
  diffResult: DiffResult;
  affectedCardCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const STATUS_CONFIG: Record<ArticleDiff["status"], { label: string; color: string; bg: string }> = {
  modified: { label: "Izmijenjen", color: "text-warning", bg: "bg-warning/10 border-warning/30" },
  added: { label: "Dodat", color: "text-success", bg: "bg-success/10 border-success/30" },
  removed: { label: "Uklonjen", color: "text-destructive", bg: "bg-destructive/10 border-destructive/30" },
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
          {summary.modified > 0 && <Badge className="bg-warning/20 text-warning border-warning/30">{summary.modified} izmijenjeno</Badge>}
          {summary.added > 0 && <Badge className="bg-success/20 text-success border-success/30">{summary.added} dodato</Badge>}
          {summary.removed > 0 && <Badge className="bg-destructive/20 text-destructive border-destructive/30">{summary.removed} uklonjeno</Badge>}
          <Badge variant="outline">{summary.unchanged} nepromijenjeno</Badge>
        </div>

        {affectedCardCount > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
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
                            seg.type === "insert" && "bg-success/20 text-success",
                            seg.type === "delete" && "bg-destructive/20 text-destructive line-through",
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
          <Button onClick={() => { onCancel(); afterDialogClose(onConfirm); }}>Potvrdi i sačuvaj</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
