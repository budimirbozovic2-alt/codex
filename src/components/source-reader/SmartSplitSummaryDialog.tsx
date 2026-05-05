import {
  Wand2, PenSquare, X, Tag as TagIcon, Plus, Trash2, Scissors,
  ChevronUp, ChevronDown, FileText, FolderTree,
} from "lucide-react";
import { useCallback, useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Source } from "@/lib/sources-storage";
import { useSourceReaderStore } from "@/store/useSourceReaderStore";
import { useCategoryData } from "@/contexts/AppContext";
import { normalizeTag, TAG_LIMITS } from "@/lib/zettelkasten-tags";
import { defaultEdit } from "@/lib/split-wizard-build";
import {
  createEmptyModule,
  htmlToPlain,
  splitHtmlIntoBlocks,
  joinHtmlBlocks,
  type SelectionModule,
} from "@/lib/selection-split-engine";
import RichTextEditor from "@/components/RichTextEditor";
import { sanitizeHtml } from "@/lib/sanitize";
import { useDirtyDialog } from "@/hooks/useDirtyDialog";
import DirtyConfirmBar from "@/components/ui/dirty-confirm-bar";

interface Props {
  source: Source;
  onSmartSplitConfirm: () => void;
}

/**
 * Esej čarobnjak — layout po uzoru na CardForm/EditorSection.
 * ──────────────────────────────────────────────────────────
 * Stacked struktura (single column), identična mentalna mapa kao editor:
 *   1. Header (naslov dijaloga + zatvaranje)
 *   2. Tip pitanja (toggle, samo Esej je aktivno — wizard pravi eseje)
 *   3. Naslov eseja (parent name)
 *   4. Cjeline odgovora = moduli (kartice sa: move ↑↓, naslov, scissors, delete, sadržaj)
 *   5. Metapodaci (potkategorija + glava)
 *   6. Submit (Kreiraj esej)
 * Bez bočnog rail-a, bez "preview" panela. Maksimalan prostor za uređivanje
 * i ručno splitovanje teksta — što je glavna funkcija wizard-a.
 */

/** Inline cutting view — radi nad HTML blokovima i čuva originalni format. */
function CuttingView({
  blocks, onCut, onCancel,
}: { blocks: string[]; onCut: (blockIndex: number) => void; onCancel: () => void }) {
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
          <div
            className="text-sm px-2 py-1 rounded prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(blk) }}
          />
        </div>
      ))}
    </div>
  );
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
  const setSplitSummaryOpen = useSourceReaderStore((s) => s.setSplitSummaryOpen);
  const setSplitResult = useSourceReaderStore((s) => s.setSplitResult);
  const setSplitModules = useSourceReaderStore((s) => s.setSplitModules);
  const wizardSubcategoryId = useSourceReaderStore((s) => s.wizardSubcategoryId);
  const wizardChapterId = useSourceReaderStore((s) => s.wizardChapterId);
  const setWizardSubcategoryId = useSourceReaderStore((s) => s.setWizardSubcategoryId);
  const setWizardChapterId = useSourceReaderStore((s) => s.setWizardChapterId);

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

  const isWizardDirty = !!splitResult && !splitDone;

  const { pendingClose, requestClose, cancelClose, confirmDiscard } = useDirtyDialog(
    isWizardDirty,
    performClose,
  );

  const handleOpenChange = (o: boolean) => {
    if (!o) requestClose();
  };

  const total = splitModules.length;

  const keptCount = useMemo(
    () => splitEdits.filter((e) => !e.skipped).length,
    [splitEdits],
  );

  // ── Section/module mutations ──────────────────────────────────────────────
  const updateModule = useCallback(
    (i: number, patch: Partial<SelectionModule>) => {
      setSplitModules((prev) => prev.map((m, j) => (j === i ? { ...m, ...patch } : m)));
    },
    [setSplitModules],
  );

  const updateEditAt = useCallback(
    (i: number, patch: Partial<ReturnType<typeof defaultEdit>>) => {
      setSplitEdits((prev) => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));
    },
    [setSplitEdits],
  );

  const addNewModule = useCallback(() => {
    const fresh = createEmptyModule(`Novi modul ${total + 1}`);
    setSplitModules((prev) => [...prev, fresh]);
    setSplitEdits((prev) => [...prev, defaultEdit(fresh)]);
  }, [total, setSplitModules, setSplitEdits]);

  const deleteModule = useCallback(
    (i: number) => {
      if (total <= 1) return;
      setSplitModules((prev) => prev.filter((_, j) => j !== i));
      setSplitEdits((prev) => prev.filter((_, j) => j !== i));
    },
    [total, setSplitModules, setSplitEdits],
  );

  const moveModule = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= total || from === to) return;
      setSplitModules((prev) => {
        const arr = [...prev];
        const [it] = arr.splice(from, 1);
        arr.splice(to, 0, it);
        return arr;
      });
      setSplitEdits((prev) => {
        const arr = [...prev];
        const [it] = arr.splice(from, 1);
        arr.splice(to, 0, it);
        return arr;
      });
    },
    [total, setSplitModules, setSplitEdits],
  );

  // ── Cutting state — per-module index (kao u editoru: jedan aktivan u trenutku) ─
  const [cuttingIndex, setCuttingIndex] = useState<number | null>(null);
  useEffect(() => { setCuttingIndex(null); }, [total]);

  const performManualCut = useCallback(
    (moduleIdx: number, blockIdx: number) => {
      const mod = splitModules[moduleIdx];
      if (!mod) return;
      const blocks = splitHtmlIntoBlocks(mod.contentHtml);
      if (blockIdx <= 0 || blockIdx >= blocks.length) return;

      const beforeHtml = joinHtmlBlocks(blocks.slice(0, blockIdx));
      // The clicked block becomes the new module's TITLE — it must be removed
      // from the body, otherwise the title line is duplicated as both title
      // and the first paragraph of the new module.
      const titleBlock = blocks[blockIdx];
      const afterHtml = joinHtmlBlocks(blocks.slice(blockIdx + 1));
      const newTitle =
        htmlToPlain(titleBlock).replace(/\s+/g, " ").trim().slice(0, 200) || "Novi modul";

      const newModule: SelectionModule = {
        articleNum: "",
        title: newTitle,
        contentText: htmlToPlain(afterHtml),
        contentHtml: afterHtml,
        plainSnippet: htmlToPlain(afterHtml).trim() || newTitle,
      };

      setSplitModules((prev) => {
        const out = [...prev];
        out[moduleIdx] = {
          ...out[moduleIdx],
          contentText: htmlToPlain(beforeHtml),
          contentHtml: beforeHtml,
          plainSnippet: htmlToPlain(beforeHtml).trim() || out[moduleIdx].title,
        };
        out.splice(moduleIdx + 1, 0, newModule);
        return out;
      });
      setSplitEdits((prev) => {
        const out = [...prev];
        out.splice(moduleIdx + 1, 0, defaultEdit(newModule));
        return out;
      });
      setCuttingIndex(null);
    },
    [splitModules, setSplitModules, setSplitEdits],
  );

  const confirmLabel = total > 1
    ? `Kreiraj esej (${keptCount} ${keptCount === 1 ? "modul" : "modula"})`
    : "Kreiraj esej";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => { if (isWizardDirty) { e.preventDefault(); requestClose(); } }}
        onEscapeKeyDown={(e) => { if (isWizardDirty) { e.preventDefault(); requestClose(); } }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            {splitDone ? "Esej kreiran" : "Novi esej iz izvora"}
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
        ) : splitResult ? (
          <div className="space-y-6">
            {/* ── Tip pitanja (kao u editoru) ─────────────────────────── */}
            <div className="flex gap-2">
              <button
                type="button"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex-1 justify-center bg-primary text-primary-foreground"
                aria-pressed="true"
              >
                <FileText className="h-4 w-4" />
                Esejsko pitanje
              </button>
            </div>

            {/* ── Naslov eseja (parent question) ───────────────────────── */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Naslov eseja</label>
              <RichTextEditor
                value={splitParentName}
                onChange={setSplitParentName}
                placeholder="Unesite naslov eseja..."
                minimal
              />
            </div>

            {/* ── Cjeline odgovora (moduli) ───────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">
                  Cjeline odgovora
                  <span className="ml-2 text-xs text-muted-foreground/70">
                    ({keptCount} / {total})
                  </span>
                </label>
                <Button type="button" variant="outline" size="sm" onClick={addNewModule}>
                  <Plus className="h-3 w-3 mr-1" /> Dodaj cjelinu
                </Button>
              </div>

              {splitModules.map((mod, i) => {
                const edit = splitEdits[i];
                if (!edit) return null;
                const isCutting = cuttingIndex === i;
                const blockCount = splitHtmlIntoBlocks(mod.contentHtml).length;
                return (
                  <div
                    key={`mod-${i}`}
                    className={cn(
                      "rounded-xl border bg-card p-4 space-y-3",
                      edit.skipped && "opacity-60",
                    )}
                  >
                    {/* Header: move + title + scissors + delete */}
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] flex-shrink-0">
                        Modul {i + 1}
                      </Badge>
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={() => moveModule(i, i - 1)}
                          className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors"
                          title="Pomjeri gore"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={i === total - 1}
                          onClick={() => moveModule(i, i + 1)}
                          className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors"
                          title="Pomjeri dolje"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <RichTextEditor
                          value={edit.question}
                          onChange={(v) => updateEditAt(i, { question: v })}
                          placeholder={mod.title || "Naziv cjeline..."}
                          minimal
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setCuttingIndex(isCutting ? null : i)}
                        disabled={edit.skipped || blockCount < 2}
                        className={cn(
                          "p-1 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
                          isCutting
                            ? "bg-warning/20 text-warning"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                        )}
                        title={
                          blockCount < 2
                            ? "Nema dovoljno blokova za rezanje"
                            : "Režim rezanja"
                        }
                        aria-label="Režim rezanja"
                      >
                        <Scissors className="h-4 w-4" />
                      </button>
                      {total > 1 && (
                        <button
                          type="button"
                          onClick={() => deleteModule(i)}
                          className="text-muted-foreground hover:text-destructive p-1"
                          title="Obriši cjelinu"
                          aria-label={`Obriši cjelinu ${i + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Content: cutting view OR rich-text editor */}
                    {isCutting ? (
                      <CuttingView
                        blocks={splitHtmlIntoBlocks(mod.contentHtml)}
                        onCut={(bIdx) => performManualCut(i, bIdx)}
                        onCancel={() => setCuttingIndex(null)}
                      />
                    ) : (
                      <div className={cn(edit.skipped && "opacity-50 pointer-events-none")}>
                        <RichTextEditor
                          value={mod.contentHtml}
                          onChange={(html) => {
                            const plain = htmlToPlain(html);
                            updateModule(i, {
                              contentHtml: html,
                              contentText: plain,
                              plainSnippet: plain.trim(),
                            });
                          }}
                          placeholder="Sadržaj ove cjeline odgovora..."
                        />
                      </div>
                    )}

                    {/* Tags chip-input */}
                    <ModuleTags edit={edit} onUpdate={(patch) => updateEditAt(i, patch)} />
                  </div>
                );
              })}
            </div>

            {/* ── Metapodaci (lokacija u predmetu) ────────────────────── */}
            <div className="space-y-4 rounded-xl border bg-card/50 p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-1.5">
                <FolderTree className="h-3.5 w-3.5" />
                Metapodaci
              </p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Podkategorija (opciono)</label>
                <Select
                  value={wizardSubcategoryId || "__none__"}
                  onValueChange={(v) => setWizardSubcategoryId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger className="bg-background">
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
              {wizardSubcategoryId && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Glava (opciono)</label>
                  <Select
                    value={wizardChapterId || "__none__"}
                    onValueChange={(v) => setWizardChapterId(v === "__none__" ? "" : v)}
                    disabled={chapters.length === 0}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={chapters.length === 0 ? "(nema glave)" : "Bez glave"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— bez glave —</SelectItem>
                      {chapters.map((ch) => (
                        <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* ── Footer actions ───────────────────────────────────────── */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <div className="flex-1 text-xs text-muted-foreground">
                {splitResult.rangeLabel && <span>{splitResult.rangeLabel}</span>}
              </div>
              <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
                Otkaži
              </Button>
              <Button
                onClick={onSmartSplitConfirm}
                className="gap-1.5"
                disabled={keptCount === 0 || !htmlToPlain(splitParentName).trim()}
                title={
                  !htmlToPlain(splitParentName).trim()
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
          </div>
        ) : null}

        <DirtyConfirmBar
          open={pendingClose}
          onCancel={cancelClose}
          onDiscard={confirmDiscard}
          onSave={async () => {
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

/** Per-module tags chip-input — same UX as before, extracted for clarity. */
function ModuleTags({
  edit,
  onUpdate,
}: {
  edit: ReturnType<typeof defaultEdit>;
  onUpdate: (patch: Partial<ReturnType<typeof defaultEdit>>) => void;
}) {
  const [draft, setDraft] = useState("");
  const commit = useCallback(() => {
    const t = normalizeTag(draft);
    if (!t) { setDraft(""); return; }
    if (edit.tags.includes(t)) { setDraft(""); return; }
    if (edit.tags.length >= TAG_LIMITS.maxPerArticle) { setDraft(""); return; }
    onUpdate({ tags: [...edit.tags, t] });
    setDraft("");
  }, [draft, edit.tags, onUpdate]);

  const removeTag = useCallback(
    (t: string) => onUpdate({ tags: edit.tags.filter((x) => x !== t) }),
    [edit.tags, onUpdate],
  );

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <TagIcon className="h-3 w-3" />
        Tagovi (opcionalno) — {edit.tags.length}/{TAG_LIMITS.maxPerArticle}
      </label>
      <div
        className={cn(
          "min-h-[38px] flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-md border bg-background",
          edit.skipped && "opacity-50 pointer-events-none",
        )}
      >
        {edit.tags.map((t) => (
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
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && draft === "" && edit.tags.length > 0) {
              removeTag(edit.tags[edit.tags.length - 1]);
            }
          }}
          onBlur={commit}
          disabled={edit.skipped || edit.tags.length >= TAG_LIMITS.maxPerArticle}
          placeholder={
            edit.tags.length >= TAG_LIMITS.maxPerArticle
              ? "Limit dosegnut"
              : "Dodaj tag (Enter)..."
          }
          className="flex-1 min-w-[100px] bg-transparent text-[12px] focus:outline-none"
        />
      </div>
    </div>
  );
}
