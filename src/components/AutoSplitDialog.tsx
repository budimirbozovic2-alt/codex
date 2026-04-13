import { Wand2, Check, RefreshCw, GitMerge as Merge, Ungroup, Sparkles } from "lucide-react";
import { useState, useMemo, useCallback } from "react";


import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { detectArticles, type DetectedArticle } from "@/lib/auto-split-engine";
import { createTextAnchor, type Source } from "@/lib/sources-storage";
import { sanitizeHtml } from "@/lib/sanitize";
import { useCardData, useCardActions } from "@/contexts/AppContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card, SourceModule, createCard } from "@/lib/spaced-repetition";
import { persistQueue } from "@/lib/persist-queue";
import { db } from "@/lib/db";
interface Props {
  open: boolean;
  onClose: () => void;
  source: Source;
}

type ArticleStatus = "new" | "exists";

/** A single article or a merged group */
interface ArticleRow {
  /** Unique key for react */
  key: string;
  /** Whether this is a merged group */
  isGroup: boolean;
  /** Group name (user-defined) */
  groupName: string;
  /** The articles in this row (1 for single, N for group) */
  articles: DetectedArticle[];
  /** Display name */
  essayName: string;
  selected: boolean;
  status: ArticleStatus;
  existingCardId?: string;
}

export default function AutoSplitDialog({ open, onClose, source }: Props) {
  const { cards } = useCardData();
  const { bulkAddCards, updateCard } = useCardActions();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [mergeNameDialog, setMergeNameDialog] = useState(false);
  const [mergeName, setMergeName] = useState("");

  // Detect articles on open
  const detected = useMemo(() => {
    if (!open) return [];
    return detectArticles(source.htmlContent);
  }, [open, source.htmlContent]);

  // Match existing cards
  const linkedCards = useMemo(
    () => cards.filter((c: Card) => c.sourceId === source.id),
    [cards, source.id]
  );

  const buildRows = useCallback((arts: DetectedArticle[]): ArticleRow[] => {
    return arts.map((art) => {
      const existing = linkedCards.find((c: Card) => {
        const q = c.question.toLowerCase();
        return q.includes(`čl. ${art.articleNum} `) || q.includes(`član ${art.articleNum}`);
      });
      return {
        key: `art-${art.articleNum}`,
        isGroup: false,
        groupName: "",
        articles: [art],
        essayName: art.essayName,
        selected: !existing,
        status: (existing ? "exists" : "new") as ArticleStatus,
        existingCardId: existing?.id,
      };
    });
  }, [linkedCards]);

  const [rows, setRows] = useState<ArticleRow[]>([]);

  // Reset when dialog opens
  useMemo(() => {
    setRows(buildRows(detected));
    setDone(false);
    setProgress(0);
    setImporting(false);
  }, [detected, buildRows]);

  const toggleRow = useCallback((idx: number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, selected: !r.selected } : r))
    );
  }, []);

  const toggleAll = useCallback(() => {
    setRows((prev) => {
      const allSelected = prev.every((r) => r.selected);
      return prev.map((r) => ({ ...r, selected: !allSelected }));
    });
  }, []);

  // ── Merge selected articles into one group ──
  const selectedIndices = rows.map((r, i) => r.selected ? i : -1).filter(i => i >= 0);
  const canMerge = selectedIndices.length >= 2;

  const handleMergeStart = useCallback(() => {
    if (!canMerge) return;
    // Pre-fill name from first selected row
    const first = rows[selectedIndices[0]];
    const nums = selectedIndices.map(i => {
      const arts = rows[i].articles;
      return arts.map(a => a.articleNum).join(",");
    }).join(", ");
    setMergeName(first.groupName || `Čl. ${nums}`);
    setMergeNameDialog(true);
  }, [canMerge, rows, selectedIndices]);

  const confirmMerge = useCallback(() => {
    if (!mergeName.trim()) return;
    setRows((prev) => {
      const selected = selectedIndices.map(i => prev[i]);
      const allArticles = selected.flatMap(r => r.articles);
      const merged: ArticleRow = {
        key: `group-${Date.now()}`,
        isGroup: true,
        groupName: mergeName.trim(),
        articles: allArticles,
        essayName: mergeName.trim(),
        selected: true,
        status: "new",
      };
      // Replace selected rows with the merged one
      const remaining = prev.filter((_, i) => !selectedIndices.includes(i));
      // Insert merged at the position of the first selected
      const insertAt = Math.min(...selectedIndices);
      const adjusted = insertAt > remaining.length ? remaining.length : insertAt;
      remaining.splice(adjusted, 0, merged);
      return remaining;
    });
    setMergeNameDialog(false);
  }, [mergeName, selectedIndices]);

  // ── Ungroup a merged row ──
  const handleUngroup = useCallback((idx: number) => {
    setRows((prev) => {
      const row = prev[idx];
      if (!row.isGroup) return prev;
      const singles: ArticleRow[] = row.articles.map((art) => ({
        key: `art-${art.articleNum}`,
        isGroup: false,
        groupName: "",
        articles: [art],
        essayName: art.essayName,
        selected: true,
        status: "new" as ArticleStatus,
      }));
      const copy = [...prev];
      copy.splice(idx, 1, ...singles);
      return copy;
    });
  }, []);

  const selectedCount = rows.filter((r) => r.selected).length;
  const newCount = rows.filter((r) => r.status === "new").length;
  const existsCount = rows.filter((r) => r.status === "exists").length;
  const groupCount = rows.filter((r) => r.isGroup).length;

  // ── Import (Bulk pattern — single state update + single IDB write) ──
  const handleImport = useCallback(async () => {
    const toImport = rows.filter((r) => r.selected);
    if (toImport.length === 0) return;

    setImporting(true);
    setProgress(0);
    const category = source.categoryId;

    // Build phase: construct all cards in memory
    const newCards: Card[] = [];
    const updates: { id: string; patch: Parameters<typeof updateCard>[1] }[] = [];

    for (const row of toImport) {
      if (row.isGroup) {
        const sections = row.articles.map((art) => ({
          title: `Član ${art.articleNum}${art.title ? ` — ${art.title}` : ""}`,
          content: sanitizeHtml(art.contentHtml),
        }));
        const sourceModules: SourceModule[] = row.articles.map((art, index) => ({
          id: crypto.randomUUID(),
          order: index,
          articleNum: art.articleNum,
          title: `Član ${art.articleNum}${art.title ? ` — ${art.title}` : ""}`,
          question: art.essayName,
          textAnchor: createTextAnchor(art.plainSnippet),
          originalSourceSnippet: art.plainSnippet,
        }));
        const combinedSnippet = row.articles.map(a => a.plainSnippet).join("\n\n");
        const anchor = createTextAnchor(combinedSnippet);

        const card = createCard(row.essayName, sections, category);
        card.updatedAt = Date.now();
        card.sourceId = source.id;
        card.textAnchor = anchor;
        card.originalSourceSnippet = combinedSnippet;
        card.childCardIds = sourceModules.map(m => m.id);
        card.sourceModules = sourceModules;
        newCards.push(card);
      } else {
        const art = row.articles[0];
        const anchor = createTextAnchor(art.plainSnippet);
        const sections = [{ title: "Odgovor", content: sanitizeHtml(art.contentHtml) }];

        if (row.status === "exists" && row.existingCardId) {
          updates.push({
            id: row.existingCardId,
            patch: {
              question: art.essayName,
              sections,
              sourceId: source.id,
              textAnchor: anchor,
              originalSourceSnippet: art.plainSnippet,
              childCardIds: undefined,
              sourceModules: undefined,
            },
          });
        } else {
          const card = createCard(art.essayName, sections, category);
          card.updatedAt = Date.now();
          card.sourceId = source.id;
          card.textAnchor = anchor;
          card.originalSourceSnippet = art.plainSnippet;
          newCards.push(card);
        }
      }
    }

    setProgress(50);

    // Write phase: single bulk insert + individual updates (updates are rare)
    bulkAddCards(newCards);
    for (const u of updates) {
      updateCard(u.id, u.patch);
    }

    // Post-import: flush persist queue to guarantee IDB write completes
    // before user navigates away (prevents phantom cards scenario)
    await persistQueue.flush();

    // Verification: confirm cards landed in IDB
    const idbCount = await db.cards.count();
    if (import.meta.env.DEV) console.log(`[AutoSplit] Bulk import done: ${newCards.length} new, ${updates.length} updated, IDB total: ${idbCount}`);

    setProgress(100);
    const count = newCards.length + updates.length;
    setImportedCount(count);
    setImporting(false);
    setDone(true);

    toast.success(`Generisano ${count} eseja`, { description: `Iz izvora "${source.title}"` });
  }, [rows, source, bulkAddCards, updateCard]);

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
          <span>Pronađeno <strong className="text-foreground">{detected.length}</strong> članova</span>
          <span>•</span>
          <Badge variant="outline" className="text-[10px] gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
            {newCount} novih
          </Badge>
          {existsCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 inline-block" />
              {existsCount} postojećih
            </Badge>
          )}
          {groupCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Merge className="h-3 w-3" />
              {groupCount} grupnih
            </Badge>
          )}
        </div>

        {/* Progress bar */}
        {importing && (
          <div className="space-y-1.5">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">{progress}% — generisanje u toku...</p>
          </div>
        )}

        {/* Done */}
        {done && (
          <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium">Uspješno generisano {importedCount} eseja!</span>
          </div>
        )}

        {/* Merge naming inline form */}
        {!done && !importing && mergeNameDialog && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Merge className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Imenuj grupni esej</span>
            </div>
            <input
              value={mergeName}
              onChange={(e) => setMergeName(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="npr. 'Sve o podnescima'"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && confirmMerge()}
            />
            <p className="text-xs text-muted-foreground">
              Članci {selectedIndices.map(i => rows[i]?.articles.map(a => a.articleNum).join(",")).join(", ")} će postati moduli (cjeline) unutar ovog eseja.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setMergeNameDialog(false)} className="flex-1">
                Otkaži
              </Button>
              <Button size="sm" onClick={confirmMerge} disabled={!mergeName.trim()} className="flex-1">
                Spoji
              </Button>
            </div>
          </div>
        )}

        {/* Article list */}
        {!done && !importing && !mergeNameDialog && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button onClick={toggleAll} className="text-xs text-primary hover:underline">
                  {rows.every((r) => r.selected) ? "Odselektuj sve" : "Selektuj sve"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                {canMerge && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMergeStart}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <Merge className="h-3.5 w-3.5" />
                    Spoji ({selectedCount})
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">{selectedCount} odabrano</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1 max-h-[400px]">
              {rows.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Nisu pronađeni članci u formatu "Član X" u ovom izvoru.
                </div>
              )}
              {rows.map((row, i) => (
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
                    onChange={() => toggleRow(i)}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {row.isGroup && <Merge className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                      <p className="text-sm font-medium truncate">{row.essayName}</p>
                    </div>
                    {row.isGroup ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {row.articles.map((a) => (
                          <span key={a.articleNum} className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground">
                            Čl. {a.articleNum}
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
                        <Sparkles className="h-3 w-3 text-amber-500" />
                        <span className="text-[10px] text-amber-500">Auto-naslov</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {row.isGroup && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); handleUngroup(i); }}
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

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          {done ? (
            <Button onClick={onClose} className="flex-1">Zatvori</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} className="flex-1" disabled={importing}>
                Otkaži
              </Button>
              <Button
                onClick={handleImport}
                className="flex-1 gap-2"
                disabled={importing || selectedCount === 0 || mergeNameDialog}
              >
                <Wand2 className="h-4 w-4" />
                Generiši {selectedCount} eseja
              </Button>
            </>
          )}
        </div>
      </DialogContent>

    </Dialog>
  );
}
