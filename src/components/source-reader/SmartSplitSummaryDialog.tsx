import { Wand2, PenSquare, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EditorV4 } from "@/components/editor-v4/EditorV4";
import { htmlToDoc } from "@/lib/editor-v4";
import { deriveHtml } from "@/lib/editor-v4/derived";
import type { Source } from "@/domains/sources/sources-storage";
import { useSourceReaderStore } from "@/store";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { htmlToPlain } from "@/lib/selection-split-engine";
import { useDirtyDialog } from "@/hooks/useDirtyDialog";
import DirtyConfirmBar from "@/components/ui/dirty-confirm-bar";
import { useSplitModules } from "@/hooks/smart-split/useSplitModules";
import { ModuleCard } from "./smart-split/ModuleCard";
import { MetadataPanel } from "./smart-split/MetadataPanel";

interface Props {
  source: Source;
  onSmartSplitConfirm: () => void;
}

/**
 * Esej čarobnjak — orkestrator. Sva logika modula živi u `useSplitModules`,
 * UI per-modul u `ModuleCard`, metapodaci u `MetadataPanel`, cutting u
 * `CuttingView`. Ovo file je samo Dialog shell + dirty-close flow.
 */
export function SmartSplitSummaryDialog({ source, onSmartSplitConfirm }: Props) {
  const {
    open,
    splitDone,
    splitResult,
    splitCreatedCount,
    setSplitSummaryOpen,
    setSplitResult,
  } = useSourceReaderStore(
    useShallow((s) => ({
      open: s.splitSummaryOpen,
      splitDone: s.splitDone,
      splitResult: s.splitResult,
      splitCreatedCount: s.splitCreatedCount,
      setSplitSummaryOpen: s.setSplitSummaryOpen,
      setSplitResult: s.setSplitResult,
    })),
  );

  const performClose = useCallback(() => {
    setSplitSummaryOpen(false);
    setSplitResult(null);
  }, [setSplitSummaryOpen, setSplitResult]);

  const isWizardDirty = !!splitResult && !splitDone;

  const { pendingClose, requestClose, cancelClose, confirmDiscard } = useDirtyDialog(
    isWizardDirty,
    performClose,
  );

  const handleOpenChange = (o: boolean) => { if (!o) requestClose(); };

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

        {open && (
          splitDone ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-4">
                <div className="h-8 w-8 rounded-full bg-success/20 flex items-center justify-center">
                  <PenSquare className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    Uspješno kreiran esej sa {splitCreatedCount} {splitCreatedCount === 1 ? "cjelinom" : "cjelina"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {splitResult?.rangeLabel} • Izvor: "{source.title}"
                  </p>
                </div>
              </div>
              <Button onClick={() => handleOpenChange(false)} className="w-full">Zatvori</Button>
            </div>
          ) : splitResult ? (
            <SmartSplitWizardBody
              source={source}
              onSmartSplitConfirm={onSmartSplitConfirm}
              onCancel={() => handleOpenChange(false)}
            />
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground" role="status">
              Priprema modula…
            </div>
          )
        )}

        <DirtyConfirmBar
          open={pendingClose}
          onCancel={cancelClose}
          onDiscard={confirmDiscard}
          onSave={async () => { cancelClose(); onSmartSplitConfirm(); }}
          message="Imate nesačuvan esej. Kartice još nisu kreirane."
          saveLabel="Kreiraj esej"
        />
      </DialogContent>
    </Dialog>
  );
}

/** Wizard form — only mounted while dialog is open to avoid split-module store churn. */
function SmartSplitWizardBody({
  source,
  onSmartSplitConfirm,
  onCancel,
}: {
  source: Source;
  onSmartSplitConfirm: () => void;
  onCancel: () => void;
}) {
  const {
    splitResult,
    splitParentName,
    setSplitParentName,
    wizardSubcategoryId,
    wizardChapterId,
    setWizardSubcategoryId,
    setWizardChapterId,
  } = useSourceReaderStore(
    useShallow((s) => ({
      splitResult: s.splitResult,
      splitParentName: s.splitParentName,
      setSplitParentName: s.setSplitParentName,
      wizardSubcategoryId: s.wizardSubcategoryId,
      wizardChapterId: s.wizardChapterId,
      setWizardSubcategoryId: s.setWizardSubcategoryId,
      setWizardChapterId: s.setWizardChapterId,
    })),
  );

  const {
    splitModules, splitEdits, total, keptCount,
    updateModule, updateEditAt, addNewModule, deleteModule, moveModule,
    performManualCut,
  } = useSplitModules();

  const { categoryRecords } = useCategoryData();
  const categoryRecord = useMemo(
    () => categoryRecords.find((c) => c.id === source.categoryId),
    [categoryRecords, source.categoryId],
  );
  const subcategories = useMemo(() => categoryRecord?.subcategories ?? [], [categoryRecord]);
  const selectedSubcategory = useMemo(
    () => subcategories.find((s) => s.id === wizardSubcategoryId),
    [subcategories, wizardSubcategoryId],
  );
  const chapters = selectedSubcategory?.chapters ?? [];

  // ── Cutting state — per-module index (one active at a time) ──
  const [cuttingIndex, setCuttingIndex] = useState<number | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  useEffect(() => { setCuttingIndex(null); setWizardStep(0); }, [total]);

  const handleCut = useCallback(
    (moduleIdx: number, blockIdx: number) => {
      if (performManualCut(moduleIdx, blockIdx)) setCuttingIndex(null);
    },
    [performManualCut],
  );

  const confirmLabel = total > 1
    ? `Kreiraj esej (${keptCount} ${keptCount === 1 ? "cjelina" : "cjelina"})`
    : "Kreiraj esej";

  const STEPS = ["Moduli", "Metapodaci", "Potvrda"] as const;

  if (!splitResult) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                i === wizardStep
                  ? "bg-primary text-primary-foreground"
                  : i < wizardStep
                    ? "bg-success/15 text-success"
                    : "bg-secondary text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
            <span className={`text-xs truncate ${i === wizardStep ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border min-w-2" />}
          </div>
        ))}
      </div>

      {wizardStep === 0 && (
        <>
          <div className="space-y-2">
            <label className="text-eyebrow normal-case tracking-normal">Naslov eseja</label>
            <ParentTitleEditor value={splitParentName} onChange={setSplitParentName} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-eyebrow normal-case tracking-normal">
                Cjeline odgovora
                <span className="ml-2 text-xs text-muted-foreground/70 font-normal normal-case tracking-normal">
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
              return (
                <ModuleCard
                  key={mod.id}
                  index={i}
                  total={total}
                  mod={mod}
                  edit={edit}
                  isCutting={cuttingIndex === i}
                  onMove={moveModule}
                  onDelete={deleteModule}
                  onToggleCut={(idx) => setCuttingIndex((cur) => (cur === idx ? null : idx))}
                  onCut={handleCut}
                  onCancelCut={() => setCuttingIndex(null)}
                  onUpdateModule={updateModule}
                  onUpdateEdit={updateEditAt}
                />
              );
            })}
          </div>
        </>
      )}

      {wizardStep === 1 && (
        <MetadataPanel
          subcategories={subcategories}
          chapters={chapters}
          subcategoryId={wizardSubcategoryId}
          chapterId={wizardChapterId}
          onSubcategoryChange={setWizardSubcategoryId}
          onChapterChange={setWizardChapterId}
        />
      )}

      {wizardStep === 2 && (
        <div className="glass-card rounded-xl p-5 space-y-3 text-sm">
          <p><span className="text-muted-foreground">Naslov:</span> {htmlToPlain(splitParentName).trim() || "—"}</p>
          <p><span className="text-muted-foreground">Cjelina:</span> {keptCount} / {total}</p>
          {splitResult.rangeLabel && (
            <p><span className="text-muted-foreground">Opseg:</span> {splitResult.rangeLabel}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t">
        <div className="flex-1 text-xs text-muted-foreground">
          Korak {wizardStep + 1} / {STEPS.length}
        </div>
        <Button variant="outline" size="sm" onClick={onCancel}>Otkaži</Button>
        {wizardStep > 0 && (
          <Button variant="outline" size="sm" onClick={() => setWizardStep((s) => s - 1)}>Nazad</Button>
        )}
        {wizardStep < STEPS.length - 1 ? (
          <Button size="sm" onClick={() => setWizardStep((s) => s + 1)}>Dalje</Button>
        ) : (
          <Button
            onClick={onSmartSplitConfirm}
            className="gap-1.5"
            disabled={keptCount === 0 || !htmlToPlain(splitParentName).trim()}
            title={
              !htmlToPlain(splitParentName).trim()
                ? "Unesite naslov eseja"
                : keptCount === 0
                  ? "Sve cjeline su preskočene"
                  : "Kreiraj esej i sve cjeline kao kartice"
            }
          >
            <Wand2 className="h-3.5 w-3.5" />
            {confirmLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Inline editor seam — uncontrolled, seeded once per mount. PR-7e M2. */
function ParentTitleEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  // Reason: uncontrolled editor seeded once per mount; reseeding from `value`
  // would clobber in-progress edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialDoc = useMemo(() => htmlToDoc(value ?? ""), []);
  return (
    <EditorV4
      initialDoc={initialDoc}
      onChange={(doc) => onChange(deriveHtml(doc))}
      placeholder="Unesite naslov eseja..."
      minimal
    />
  );
}

