import {
  Wand2, PenSquare, ChevronLeft, ChevronRight, SkipForward,
  X, Tag as TagIcon, Eye, Plus, Trash2, Scissors, FolderTree,
} from "lucide-react";
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Source } from "@/lib/sources-storage";
import { useSourceReaderStore } from "@/store/useSourceReaderStore";
import { useCategoryData } from "@/contexts/AppContext";
import { sanitizeHtml } from "@/lib/sanitize";
import { normalizeTag, TAG_LIMITS } from "@/lib/zettelkasten-tags";
import { unfinishedIndices, defaultEdit } from "@/lib/split-wizard-build";
import { createEmptyModule, splitModuleByDelimiter, type SelectionModule } from "@/lib/selection-split-engine";
import { useDirtyDialog } from "@/hooks/useDirtyDialog";
import DirtyConfirmBar from "@/components/ui/dirty-confirm-bar";

interface Props {
  source: Source;
  onSmartSplitConfirm: () => void;
}

/**
 * Esej čarobnjak (jedan ekran)
 * ────────────────────────────
 * Korisnik selektuje tekst u SourceReader-u → otvara se jedan dijalog sa:
 *  - Lokacijom u predmetu (Potkategorija + Glava)
 *  - Naslovom nadređenog eseja
 *  - Lijevim rail-om sa modulima (klik za skok, "+ Dodaj modul", trash)
 *  - Editorom modula (Pitanje + plain text sadržaj + tagovi + live pregled)
 *  - Inline "Podijeli modul" dugmetom (popover) za ručnu podjelu
 *
 * Bez automatske detekcije "Član X" — wizard uvijek startuje sa JEDNIM
 * modulom; korisnik ručno odlučuje da li i kako će ga dijeliti. Bez zasebnog
 * "preview prije importa" ekrana — pregled je ugrađen u editor.
 *
 * Output: jedan esej (combined mode) sa N modula → sekcija. Kreira se
 * direktno klikom na "Kreiraj esej" — bez međukoraka.
 */

/** Zaštićeni HTML escape (textarea → siguran <p>). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain tekst → siguran HTML (paragrafi po praznom redu, br po single newline). */
function plainTextToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

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
  const stepIndex = useSourceReaderStore((s) => s.splitStepIndex);
  const setStepIndex = useSourceReaderStore((s) => s.setSplitStepIndex);
  const setSplitSummaryOpen = useSourceReaderStore((s) => s.setSplitSummaryOpen);
  const setSplitResult = useSourceReaderStore((s) => s.setSplitResult);
  const setSplitModules = useSourceReaderStore((s) => s.setSplitModules);
  const wizardSubcategoryId = useSourceReaderStore((s) => s.wizardSubcategoryId);
  const wizardChapterId = useSourceReaderStore((s) => s.wizardChapterId);
  const setWizardSubcategoryId = useSourceReaderStore((s) => s.setWizardSubcategoryId);
  const setWizardChapterId = useSourceReaderStore((s) => s.setWizardChapterId);

  // ── Subject taxonomy: subcategories + chapters scoped to source.categoryId ─
  const { categoryRecords } = useCategoryData();
  const categoryRecord = useMemo(
    () => categoryRecords.find((c) => c.id === source.categoryId),
    [categoryRecords, source.categoryId],
  );
  const subcategories = categoryRecord?.subcategories ?? [];
  const selectedSubcategory = useMemo(
    () => subcategories.find((s) => s.id === wizardSubcategoryId),
    [subcategories, wizardSubcategoryId],
  );
  const chapters = selectedSubcategory?.chapters ?? [];

  const performClose = useCallback(() => {
    setSplitSummaryOpen(false);
    setSplitResult(null);
  }, [setSplitSummaryOpen, setSplitResult]);

  // Wizard is "dirty" while user has an unsaved configuration in flight.
  const isWizardDirty = !!splitResult && !splitDone;

  const { pendingClose, requestClose, cancelClose, confirmDiscard } = useDirtyDialog(
    isWizardDirty,
    performClose,
  );

  const handleOpenChange = (o: boolean) => {
    if (!o) requestClose();
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

  // ── Module management (manual add / delete / split) ──────────────────────
  const updateModule = useCallback(
    (i: number, patch: Partial<SelectionModule>) => {
      setSplitModules((prev) => prev.map((m, j) => (j === i ? { ...m, ...patch } : m)));
    },
    [setSplitModules],
  );

  const addNewModule = useCallback(() => {
    const fresh = createEmptyModule(`Novi modul ${total + 1}`);
    setSplitModules((prev) => [...prev, fresh]);
    setSplitEdits((prev) => [...prev, defaultEdit(fresh)]);
    setStepIndex(total); // jump to the new one (its index = old total)
  }, [total, setSplitModules, setSplitEdits, setStepIndex]);

  const deleteModule = useCallback(
    (i: number) => {
      if (total <= 1) return; // never let it go to zero
      setSplitModules((prev) => prev.filter((_, j) => j !== i));
      setSplitEdits((prev) => prev.filter((_, j) => j !== i));
      setStepIndex((s) => Math.max(0, s >= i ? s - 1 : s));
    },
    [total, setSplitModules, setSplitEdits, setStepIndex],
  );

  const [splitPopoverOpen, setSplitPopoverOpen] = useState(false);
  const [customDelimiter, setCustomDelimiter] = useState("---");

  const performSplit = useCallback(
    (mode: "blank-line" | "article" | "custom") => {
      if (!currentModule) return;
      const delim = mode === "custom" ? { custom: customDelimiter } : mode;
      const pieces = splitModuleByDelimiter(currentModule, delim);
      if (pieces.length <= 1) return;
      setSplitModules((prev) => {
        const out = [...prev];
        out.splice(safeIndex, 1, ...pieces);
        return out;
      });
      setSplitEdits((prev) => {
        const out = [...prev];
        out.splice(safeIndex, 1, ...pieces.map((p) => defaultEdit(p)));
        return out;
      });
      setSplitPopoverOpen(false);
    },
    [currentModule, customDelimiter, safeIndex, setSplitModules, setSplitEdits],
  );

  const showNav = total > 1;
  const confirmLabel = total > 1
    ? `Kreiraj esej (${keptCount} ${keptCount === 1 ? "modul" : "modula"})`
    : "Kreiraj esej";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[88vh] overflow-hidden flex flex-col"
        onPointerDownOutside={(e) => { if (isWizardDirty) { e.preventDefault(); requestClose(); } }}
        onEscapeKeyDown={(e) => { if (isWizardDirty) { e.preventDefault(); requestClose(); } }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            {splitDone ? "Esej kreiran" : "Kreiranje eseja"}
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
                  Uspješno kreiran esej sa {splitCreatedCount} {splitCreatedCount === 1 ? "modulom" : "modula"}
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
            {/* ── Info linija ──────────────────────────────────────────── */}
            <div className="text-xs text-muted-foreground">
              <strong className="text-foreground">{keptCount}</strong> / {total} {total === 1 ? "modul odabran" : "modula odabrano"}
              {splitResult.rangeLabel && <> • {splitResult.rangeLabel}</>}
            </div>

            {/* ── Lokacija u predmetu (potkategorija + glava) ────────────── */}
            <div className="rounded-lg border bg-muted/20 p-2.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <FolderTree className="h-3.5 w-3.5" />
                Lokacija u predmetu
                <span className="text-[10px] font-normal text-muted-foreground/70">
                  (vrijedi za sve kartice)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Potkategorija
                  </label>
                  <Select
                    value={wizardSubcategoryId || "__none__"}
                    onValueChange={(v) => setWizardSubcategoryId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Direktno u predmet" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— direktno u predmet —</SelectItem>
                      {subcategories.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Glava
                  </label>
                  <Select
                    value={wizardChapterId || "__none__"}
                    onValueChange={(v) => setWizardChapterId(v === "__none__" ? "" : v)}
                    disabled={!wizardSubcategoryId || chapters.length === 0}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder={
                        !wizardSubcategoryId
                          ? "Prvo izaberi potkategoriju"
                          : chapters.length === 0
                            ? "(nema glave)"
                            : "Bez glave"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— bez glave —</SelectItem>
                      {chapters.map((ch) => (
                        <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* ── Naslov eseja ─────────────────────────────────────────── */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Naslov eseja
              </label>
              <input
                value={splitParentName}
                onChange={(e) => setSplitParentName(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Unesite naslov eseja..."
              />
            </div>

            {/* ── Body: rail (uvijek vidljiv) + editor ──────────────────── */}
            <div className="flex-1 min-h-0 grid gap-3 overflow-hidden grid-cols-[220px_1fr]">
              <div className="overflow-y-auto border rounded-lg bg-muted/30 p-1.5 flex flex-col">
                <div className="space-y-0.5 flex-1">
                  {splitModules.map((mod, i) => {
                    const edit = splitEdits[i];
                    const isActive = i === safeIndex;
                    const isSkipped = edit?.skipped;
                    const isPersonalized =
                      edit && !isSkipped && edit.question.trim() !== mod.title.trim();
                    return (
                      <div
                        key={`mod-${i}`}
                        className={cn(
                          "group rounded-md text-xs transition-colors flex items-center gap-1 pr-1",
                          isActive
                            ? "bg-primary/15 ring-1 ring-primary/40"
                            : "hover:bg-muted",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setStepIndex(i)}
                          className={cn(
                            "flex-1 min-w-0 text-left px-2 py-1.5 flex items-center gap-2",
                            isActive ? "text-foreground" : "text-muted-foreground",
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
                            {i + 1}
                          </Badge>
                          <span className="truncate flex-1">{edit?.question || mod.title}</span>
                          {edit?.tags.length ? (
                            <TagIcon className="h-2.5 w-2.5 flex-shrink-0 text-primary" />
                          ) : null}
                        </button>
                        {total > 1 && (
                          <button
                            type="button"
                            onClick={() => deleteModule(i)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            title="Obriši modul"
                            aria-label={`Obriši modul ${i + 1}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={addNewModule}
                  className="mt-1.5 w-full text-xs px-2 py-1.5 rounded-md border border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Dodaj modul
                </button>
              </div>

              {/* Right pane — editor for the active module */}
              <div className="overflow-y-auto pr-1 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      Modul {safeIndex + 1} / {total}
                    </Badge>
                    {currentEdit.skipped && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        preskočeno
                      </Badge>
                    )}
                  </div>
                  {total > 1 && (
                    <button
                      type="button"
                      onClick={() => updateEdit(safeIndex, { skipped: !currentEdit.skipped })}
                      className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <SkipForward className="h-3 w-3" />
                      {currentEdit.skipped ? "Vrati u import" : "Preskoči"}
                    </button>
                  )}
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
                </div>

                {/* Module content (plain text, no HTML tags exposed) */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Sadržaj modula
                  </label>
                  <textarea
                    value={currentModule.contentText}
                    onChange={(e) => {
                      const text = e.target.value;
                      const html = plainTextToHtml(text);
                      updateModule(safeIndex, {
                        contentHtml: html,
                        contentText: text,
                        plainSnippet: text.trim(),
                      });
                    }}
                    disabled={currentEdit.skipped}
                    rows={8}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y disabled:opacity-50"
                    placeholder="Unesite ili prepravite tekst modula..."
                  />
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-[10px] text-muted-foreground">
                      Prazan red razdvaja paragrafe. Tekst se sanitizuje prije snimanja.
                    </p>
                    <Popover open={splitPopoverOpen} onOpenChange={setSplitPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          disabled={currentEdit.skipped}
                          title="Podijeli ovaj modul na više dijelova"
                        >
                          <Scissors className="h-3 w-3" />
                          Podijeli modul
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 p-3 space-y-2">
                        <p className="text-xs font-medium">Podijeli na više modula</p>
                        <button
                          type="button"
                          onClick={() => performSplit("blank-line")}
                          className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                        >
                          Po praznoj liniji (paragrafima)
                        </button>
                        <button
                          type="button"
                          onClick={() => performSplit("article")}
                          className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                        >
                          Po "Član X" markerima
                        </button>
                        <div className="space-y-1.5 pt-1 border-t">
                          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Po custom graničniku
                          </label>
                          <div className="flex gap-1.5">
                            <input
                              value={customDelimiter}
                              onChange={(e) => setCustomDelimiter(e.target.value)}
                              className="flex-1 px-2 py-1 rounded border bg-background text-xs"
                              placeholder="npr. ---"
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => performSplit("custom")}
                              disabled={!customDelimiter.trim()}
                              className="h-7 text-xs"
                            >
                              Podijeli
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
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

                {/* Live preview */}
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
              {showNav && (
                <>
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
                </>
              )}
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
                Otkaži
              </Button>
              <Button
                size="sm"
                onClick={onSmartSplitConfirm}
                className="gap-1.5"
                disabled={keptCount === 0 || !splitParentName.trim()}
                title={
                  !splitParentName.trim()
                    ? "Unesite naslov eseja"
                    : keptCount === 0
                      ? "Svi moduli su preskočeni"
                      : "Kreiraj esej i sve module kao kartice"
                }
              >
                <Wand2 className="h-3.5 w-3.5" />
                {confirmLabel}
              </Button>
            </div>
          </>
        ) : null}

        <DirtyConfirmBar
          open={pendingClose}
          onCancel={cancelClose}
          onDiscard={confirmDiscard}
          onSave={async () => {
            // "Sačuvaj i zatvori" = direktno kreiraj esej.
            cancelClose();
            onSmartSplitConfirm();
          }}
          message="Imate nesačuvan esej. Kartice još nisu kreirane."
          saveLabel="Kreiraj esej"
        />
      </DialogContent>
    </Dialog>
  );
}
