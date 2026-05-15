import { Wand2, PenSquare, Plus, FileText } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import RichTextEditor from "@/components/RichTextEditor";
import type { Source } from "@/lib/sources-storage";
import { useSourceReaderStore } from "@/store/useSourceReaderStore";
import { useCategoryData } from "@/contexts/AppContext";
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
  const open = useSourceReaderStore((s) => s.splitSummaryOpen);
  const splitDone = useSourceReaderStore((s) => s.splitDone);
  const splitResult = useSourceReaderStore((s) => s.splitResult);
  const splitCreatedCount = useSourceReaderStore((s) => s.splitCreatedCount);
  const splitParentName = useSourceReaderStore((s) => s.splitParentName);
  const setSplitParentName = useSourceReaderStore((s) => s.setSplitParentName);
  const setSplitSummaryOpen = useSourceReaderStore((s) => s.setSplitSummaryOpen);
  const setSplitResult = useSourceReaderStore((s) => s.setSplitResult);
  const wizardSubcategoryId = useSourceReaderStore((s) => s.wizardSubcategoryId);
  const wizardChapterId = useSourceReaderStore((s) => s.wizardChapterId);
  const setWizardSubcategoryId = useSourceReaderStore((s) => s.setWizardSubcategoryId);
  const setWizardChapterId = useSourceReaderStore((s) => s.setWizardChapterId);

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

  const handleOpenChange = (o: boolean) => { if (!o) requestClose(); };

  // ── Cutting state — per-module index (one active at a time) ──
  const [cuttingIndex, setCuttingIndex] = useState<number | null>(null);
  useEffect(() => { setCuttingIndex(null); }, [total]);

  const handleCut = useCallback(
    (moduleIdx: number, blockIdx: number) => {
      if (performManualCut(moduleIdx, blockIdx)) setCuttingIndex(null);
    },
    [performManualCut],
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
            <Button onClick={() => handleOpenChange(false)} className="w-full">Zatvori</Button>
          </div>
        ) : splitResult ? (
          <div className="space-y-6">
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

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Naslov eseja</label>
              <RichTextEditor
                value={splitParentName}
                onChange={setSplitParentName}
                placeholder="Unesite naslov eseja..."
                minimal
              />
            </div>

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
                return (
                  <ModuleCard
                    key={`mod-${i}`}
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

            <MetadataPanel
              subcategories={subcategories}
              chapters={chapters}
              subcategoryId={wizardSubcategoryId}
              chapterId={wizardChapterId}
              onSubcategoryChange={setWizardSubcategoryId}
              onChapterChange={setWizardChapterId}
            />

            <div className="flex items-center gap-2 pt-2 border-t">
              <div className="flex-1 text-xs text-muted-foreground">
                {splitResult.rangeLabel && <span>{splitResult.rangeLabel}</span>}
              </div>
              <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>Otkaži</Button>
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
          onSave={async () => { cancelClose(); onSmartSplitConfirm(); }}
          message="Imate nesačuvan esej. Kartice još nisu kreirane."
          saveLabel="Kreiraj esej"
        />
      </DialogContent>
    </Dialog>
  );
}
