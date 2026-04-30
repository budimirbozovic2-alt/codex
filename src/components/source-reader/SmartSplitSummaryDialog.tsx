import {
  Wand2, PenSquare, ChevronLeft, ChevronRight, SkipForward,
  X, Tag as TagIcon, Layers, FileText, Eye,
} from "lucide-react";
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Source } from "@/lib/sources-storage";
import { useSourceReaderStore } from "@/store/useSourceReaderStore";
import { sanitizeHtml } from "@/lib/sanitize";
import { normalizeTag, TAG_LIMITS } from "@/lib/zettelkasten-tags";
import { unfinishedIndices } from "@/lib/split-wizard-build";

interface Props {
  source: Source;
  onSmartSplitConfirm: () => void;
}

/**
 * Smart-Split Wizard
 * ──────────────────
 * The user has selected a span of legal text containing multiple "Član X"
 * markers. The wizard walks them through one article at a time, letting them
 * personalize the question, attach lightweight tags, and preview how the card
 * will look in study mode — before any card is actually written to IDB.
 *
 * Two output modes:
 *  - separate  → each module becomes its own essay card (default for cherry-picking)
 *  - combined  → all modules become sections of one parent essay (legacy behaviour)
 *
 * Layout: a sticky left rail listing all modules (click to jump, with skipped /
 * personalized state cues) + a right pane with question editor, tag chips, and
 * an inline preview of the card body.
 */
export function SmartSplitSummaryDialog({ source, onSmartSplitConfirm }: Props) {
  const open = useSourceReaderStore((s) => s.splitSummaryOpen);
  const splitDone = useSourceReaderStore((s) => s.splitDone);
  const splitResult = useSourceReaderStore((s) => s.splitResult);
  const splitCreatedCount = useSourceReaderStore((s) => s.splitCreatedCount);
  const splitParentName = useSourceReaderStore((s) => s.splitParentName);
  const setSplitParentName = useSourceReaderStore((s) => s.setSplitParentName);
  const splitModules = useSourceReaderStore((s) => s.splitModules);
  const splitEdits = useSourceReaderStore((s) => s.splitEdits);
  const setSplitEdits = useSourceReaderStore((s) => s.setSplitEdits);
  const splitMode = useSourceReaderStore((s) => s.splitMode);
  const setSplitMode = useSourceReaderStore((s) => s.setSplitMode);
  const stepIndex = useSourceReaderStore((s) => s.splitStepIndex);
  const setStepIndex = useSourceReaderStore((s) => s.setSplitStepIndex);
  const setSplitSummaryOpen = useSourceReaderStore((s) => s.setSplitSummaryOpen);
  const setSplitResult = useSourceReaderStore((s) => s.setSplitResult);

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setSplitSummaryOpen(false);
      setSplitResult(null);
    }
  };

  const total = splitModules.length;
  const safeIndex = Math.min(stepIndex, Math.max(0, total - 1));
  const currentModule = splitModules[safeIndex];
  const currentEdit = splitEdits[safeIndex];

  const keptCount = useMemo(
    () => splitEdits.filter((e) => !e.skipped).length,
    [splitEdits],
  );

  const updateEdit = useCallback(
    (i: number, patch: Partial<typeof currentEdit>) => {
      setSplitEdits((prev) => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));
    },
    [setSplitEdits],
  );

  const goPrev = useCallback(() => setStepIndex((s) => Math.max(0, s - 1)), [setStepIndex]);
  const goNext = useCallback(
    () => setStepIndex((s) => Math.min(total - 1, s + 1)),
    [setStepIndex, total],
  );
  const goToNextUnfinished = useCallback(() => {
    const candidates = unfinishedIndices(splitModules, splitEdits).filter(
      (i) => i > safeIndex,
    );
    if (candidates.length > 0) setStepIndex(candidates[0]);
    else {
      // wrap to the first unfinished one before current
      const all = unfinishedIndices(splitModules, splitEdits);
      if (all.length > 0) setStepIndex(all[0]);
    }
  }, [splitModules, splitEdits, safeIndex, setStepIndex]);

  // ── Tag chip-input local state ────────────────────────────────────────────
  const [tagDraft, setTagDraft] = useState("");
  useEffect(() => { setTagDraft(""); }, [safeIndex]);

  const commitTag = useCallback(() => {
    if (!currentEdit) return;
    const t = normalizeTag(tagDraft);
    if (!t) { setTagDraft(""); return; }
    if (currentEdit.tags.includes(t)) { setTagDraft(""); return; }
    if (currentEdit.tags.length >= TAG_LIMITS.maxPerArticle) { setTagDraft(""); return; }
    updateEdit(safeIndex, { tags: [...currentEdit.tags, t] });
    setTagDraft("");
  }, [tagDraft, currentEdit, safeIndex, updateEdit]);

  const removeTag = useCallback(
    (t: string) => {
      if (!currentEdit) return;
      updateEdit(safeIndex, { tags: currentEdit.tags.filter((x) => x !== t) });
    },
    [currentEdit, safeIndex, updateEdit],
  );

  // ── Preview HTML (memoized so DOMPurify only runs on actual change) ──────
  const previewHtml = useMemo(
    () => (currentModule ? sanitizeHtml(currentModule.contentHtml) : ""),
    [currentModule],
  );

  // Auto-focus the question textarea on step change to keep flow keyboard-driven.
  const questionRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (open && !splitDone) questionRef.current?.focus();
  }, [open, safeIndex, splitDone]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            {splitDone ? "Generisanje završeno" : "Smart-Split čarobnjak"}
          </DialogTitle>
        </DialogHeader>

        {splitDone ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-4">
              <div className="h-8 w-8 rounded-full bg-success/20 flex items-center justify-center">
                <PenSquare className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {splitMode === "separate"
                    ? `Uspješno generisano ${splitCreatedCount} kartica`
                    : `Uspješno generisan 1 esej sa ${splitCreatedCount} modula`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {splitResult?.rangeLabel} • Izvor: "{source.title}"
                </p>
              </div>
            </div>
            <Button onClick={() => handleOpenChange(false)} className="w-full">
              Zatvori
            </Button>
          </div>
        ) : splitResult && currentModule && currentEdit ? (
          <>
            {/* ── Top: mode toggle + summary ─────────────────────────────── */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
                <button
                  type="button"
                  onClick={() => setSplitMode("separate")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    splitMode === "separate"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title="Svaki član postaje zasebna kartica"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Zasebne kartice
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode("combined")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    splitMode === "combined"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title="Jedan esej sa modulima (cjelinama)"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Jedan esej + moduli
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                <strong className="text-foreground">{keptCount}</strong> / {total} odabrano
                {" • "}{splitResult.rangeLabel}
              </div>
            </div>

            {/* ── Combined-mode parent name ─────────────────────────────── */}
            {splitMode === "combined" && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Naslov nadređenog eseja
                </label>
                <input
                  value={splitParentName}
                  onChange={(e) => setSplitParentName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Unesite naslov eseja..."
                />
              </div>
            )}

            {/* ── Body: rail + editor ────────────────────────────────────── */}
            <div className="flex-1 min-h-0 grid grid-cols-[200px_1fr] gap-3 overflow-hidden">
              {/* Left rail — module list */}
              <div className="overflow-y-auto border rounded-lg bg-muted/30 p-1.5 space-y-0.5">
                {splitModules.map((mod, i) => {
                  const edit = splitEdits[i];
                  const isActive = i === safeIndex;
                  const isSkipped = edit?.skipped;
                  const isPersonalized =
                    edit && !isSkipped && edit.question.trim() !== mod.title.trim();
                  return (
                    <button
                      key={`${mod.articleNum}-${i}`}
                      type="button"
                      onClick={() => setStepIndex(i)}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2",
                        isActive
                          ? "bg-primary/15 text-foreground ring-1 ring-primary/40"
                          : "hover:bg-muted text-muted-foreground",
                        isSkipped && "opacity-50 line-through",
                      )}
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] h-4 px-1 flex-shrink-0",
                          isPersonalized && "border-primary/50 text-primary",
                        )}
                      >
                        čl. {mod.articleNum}
                      </Badge>
                      <span className="truncate flex-1">{edit?.question || mod.title}</span>
                      {edit?.tags.length ? (
                        <TagIcon className="h-2.5 w-2.5 flex-shrink-0 text-primary" />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {/* Right pane — editor for the active module */}
              <div className="overflow-y-auto pr-1 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      Korak {safeIndex + 1} / {total}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      Član {currentModule.articleNum}
                    </Badge>
                    {currentEdit.skipped && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        preskočeno
                      </Badge>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateEdit(safeIndex, { skipped: !currentEdit.skipped })}
                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <SkipForward className="h-3 w-3" />
                    {currentEdit.skipped ? "Vrati u import" : "Preskoči ovaj član"}
                  </button>
                </div>

                {/* Question editor */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Pitanje (kako će biti zapamćeno)
                  </label>
                  <textarea
                    ref={questionRef}
                    value={currentEdit.question}
                    onChange={(e) => updateEdit(safeIndex, { question: e.target.value })}
                    disabled={currentEdit.skipped}
                    className="w-full min-h-[60px] px-3 py-2 rounded-md border bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none disabled:opacity-50"
                    placeholder={currentModule.title}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Default: <span className="font-mono">{currentModule.title}</span>
                  </p>
                </div>

                {/* Tags */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <TagIcon className="h-3 w-3" />
                    Tagovi (opcionalno) — {currentEdit.tags.length}/{TAG_LIMITS.maxPerArticle}
                  </label>
                  <div
                    className={cn(
                      "min-h-[38px] flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-md border bg-background",
                      currentEdit.skipped && "opacity-50 pointer-events-none",
                    )}
                  >
                    {currentEdit.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[11px]"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() => removeTag(t)}
                          className="hover:text-foreground"
                          aria-label={`Ukloni tag ${t}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          commitTag();
                        } else if (
                          e.key === "Backspace" &&
                          tagDraft === "" &&
                          currentEdit.tags.length > 0
                        ) {
                          removeTag(currentEdit.tags[currentEdit.tags.length - 1]);
                        }
                      }}
                      onBlur={commitTag}
                      disabled={
                        currentEdit.skipped ||
                        currentEdit.tags.length >= TAG_LIMITS.maxPerArticle
                      }
                      placeholder={
                        currentEdit.tags.length >= TAG_LIMITS.maxPerArticle
                          ? "Limit dosegnut"
                          : "Dodaj tag (Enter)..."
                      }
                      className="flex-1 min-w-[100px] bg-transparent text-[12px] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Preview */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    Pregled kartice
                  </label>
                  <div className="rounded-md border bg-card p-3">
                    <p className="text-sm font-medium mb-2">
                      {currentEdit.question.trim() || currentModule.title}
                    </p>
                    <div
                      className="text-xs prose prose-sm max-w-none card-prose max-h-40 overflow-y-auto"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Footer: navigation + actions ──────────────────────────── */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={goPrev}
                disabled={safeIndex === 0}
                className="gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Nazad
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goNext}
                disabled={safeIndex === total - 1}
                className="gap-1"
              >
                Naprijed
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={goToNextUnfinished}
                className="gap-1 text-xs"
                title="Skoči na sljedeći needitovani član"
              >
                <Wand2 className="h-3 w-3" />
                Sljedeći needitovan
              </Button>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
                Otkaži
              </Button>
              <Button
                size="sm"
                onClick={onSmartSplitConfirm}
                className="gap-1.5"
                disabled={keptCount === 0}
              >
                <Wand2 className="h-3.5 w-3.5" />
                {splitMode === "separate"
                  ? `Kreiraj ${keptCount} kartica`
                  : `Kreiraj 1 esej (${keptCount} modula)`}
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
