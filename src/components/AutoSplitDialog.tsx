import { Wand2, Check, RefreshCw, GitMerge as Merge, Ungroup, Sparkles } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Source } from "@/domains/sources/sources-storage";
import { cn } from "@/lib/utils";
import { useAutoSplitImport } from "@/hooks/useAutoSplitImport";

interface Props {
  open: boolean;
  onClose: () => void;
  source: Source;
}

/**
 * Dumb presentation shell. All state, parsing, and persistence live in
 * `useAutoSplitImport` → `import-planner` (domain) + `autoSplitImportService` (I/O).
 */
export default function AutoSplitDialog({ open, onClose, source }: Props) {
  const a = useAutoSplitImport(open, source);
  const importing = a.phase === "importing";
  const done = a.phase === "done";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Wand2 className="h-5 w-5 text-primary" />
            Auto-generisanje eseja
          </DialogTitle>
        </DialogHeader>

        {/* Summary bar */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span>Pronađeno <strong className="text-foreground">{a.detected.length}</strong> članova</span>
          <span>•</span>
          <Badge variant="outline" className="text-[10px] gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />
            {a.counts.newCount} novih
          </Badge>
          {a.counts.existsCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-warning inline-block" />
              {a.counts.existsCount} postojećih
            </Badge>
          )}
          {a.counts.groupCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Merge className="h-3 w-3" />
              {a.counts.groupCount} grupnih
            </Badge>
          )}
        </div>

        {importing && (
          <div className="space-y-1.5">
            <Progress value={a.progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">{a.progress}% — generisanje u toku...</p>
          </div>
        )}

        {done && (
          <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3">
            <Check className="h-4 w-4 text-success" />
            <span className="text-sm font-medium">Uspješno generisano {a.importedCount} eseja!</span>
          </div>
        )}

        {!done && !importing && a.mergeNameDialog && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Merge className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Imenuj grupni esej</span>
            </div>
            <input
              value={a.mergeName}
              onChange={(e) => a.setMergeName(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="npr. 'Sve o podnescima'"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && a.confirmMerge()}
            />
            <p className="text-xs text-muted-foreground">
              Članci {a.selectedIndices.map((i) => a.rows[i]?.articles.map((x) => x.articleNum).join(",")).join(", ")} će postati moduli (cjeline) unutar ovog eseja.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={a.closeMergeDialog} className="flex-1">
                Otkaži
              </Button>
              <Button size="sm" onClick={a.confirmMerge} disabled={!a.mergeName.trim()} className="flex-1">
                Spoji
              </Button>
            </div>
          </div>
        )}

        {!done && !importing && !a.mergeNameDialog && (
          <>
            <div className="flex items-center justify-between gap-2">
              <button onClick={a.toggleAll} className="text-xs text-primary hover:underline">
                {a.rows.every((r) => r.selected) ? "Odselektuj sve" : "Selektuj sve"}
              </button>
              <div className="flex items-center gap-2">
                {a.canMerge && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={a.openMergeDialog}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <Merge className="h-3.5 w-3.5" />
                    Spoji ({a.selectedCount})
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">{a.selectedCount} odabrano</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1 max-h-[400px]">
              {a.rows.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Nisu pronađeni članci u formatu "Član X" u ovom izvoru.
                </div>
              )}
              {a.rows.map((row, i) => (
                <label
                  key={row.key}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                    row.isGroup && "border-l-2 border-l-primary",
                    row.selected
                      ? "bg-primary/5 border-primary/30"
                      : "bg-card border-border hover:bg-muted/50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={() => a.toggleRow(i)}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {row.isGroup && <Merge className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                      <p className="text-sm font-medium truncate">{row.essayName}</p>
                    </div>
                    {row.isGroup ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {row.articles.map((art) => (
                          <span key={art.articleNum} className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground">
                            Čl. {art.articleNum}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {row.articles[0].plainSnippet.slice(0, 120)}...
                      </p>
                    )}
                    {row.articles[0]?.autoTitle && !row.isGroup && (
                      <div className="flex items-center gap-1 mt-1">
                        <Sparkles className="h-3 w-3 text-warning" />
                        <span className="text-[10px] text-warning">Auto-naslov</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {row.isGroup && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); a.ungroup(i); }}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title="Razgrupiši"
                      >
                        <Ungroup className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                    {row.status === "exists" && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <RefreshCw className="h-3 w-3" />
                        Ažuriraj
                      </Badge>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-3 pt-2">
          {done ? (
            <Button onClick={onClose} className="flex-1">Zatvori</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} className="flex-1" disabled={importing}>
                Otkaži
              </Button>
              <Button
                onClick={a.startImport}
                className="flex-1 gap-2"
                disabled={importing || a.selectedCount === 0 || a.mergeNameDialog}
              >
                <Wand2 className="h-4 w-4" />
                Generiši {a.selectedCount} eseja
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
