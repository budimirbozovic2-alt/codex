import { useState, useCallback } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card } from "@/lib/spaced-repetition";
import { MenuStep } from "./export-import/MenuStep";
import { ExportStep } from "./export-import/ExportStep";
import { ProgressStep } from "./export-import/ProgressStep";
import { ImportConfirmStep } from "./export-import/ImportConfirmStep";
import { ImportConflictStep } from "./export-import/ImportConflictStep";
import { validateImportFile } from "./export-import/useImportValidation";
import type { Step, ImportValidation, ImportStrategy } from "./export-import/types";
import type { ImportSlice } from "@/lib/backup/import-slice";

interface ExportImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExportTemplate: (compress: boolean, onProgress: (p: number, msg: string) => void) => Promise<void>;
  onExportFull: (compress: boolean, onProgress: (p: number, msg: string) => void) => Promise<void>;
  onImport: (
    file: File,
    strategy: ImportStrategy,
    onProgress: ((p: number, msg: string) => void) | undefined,
    slice: ImportSlice,
  ) => Promise<void>;
  cards: Card[];
}

export default function ExportImportDialog({
  open, onOpenChange, onExportTemplate, onExportFull, onImport, cards,
}: ExportImportDialogProps) {
  const [step, setStep] = useState<Step>("menu");
  const [compress, setCompress] = useState(true);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [validation, setValidation] = useState<ImportValidation | null>(null);
  // Default to selective: most user-friendly for restoring an old backup
  // into a refactored app where Sources / KB / Mind Maps must stay intact.
  const [cardsOnly, setCardsOnly] = useState(true);

  const reset = () => {
    setStep("menu"); setValidation(null); setProgress(0); setProgressMsg("");
    setCardsOnly(true);
  };
  const handleOpenChange = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const onProgress = useCallback((p: number, msg: string) => {
    setProgress(p);
    setProgressMsg(msg);
  }, []);

  const handleExportTemplate = async () => {
    setStep("exporting");
    try { await onExportTemplate(compress, onProgress); }
    finally { handleOpenChange(false); }
  };

  const handleExportFull = async () => {
    setStep("exporting");
    try { await onExportFull(compress, onProgress); }
    finally { handleOpenChange(false); }
  };

  const handleFileSelected = async (file: File) => {
    setStep("import-validating");
    setProgressMsg("Validacija fajla...");
    setProgress(20);
    const result = await validateImportFile(file, onProgress);
    setValidation(result);
    if (!result.valid) {
      setStep("import-confirm");
    } else if (result.duplicateCount > 0 || result.duplicateCategoryCount > 0) {
      setStep("import-conflict");
    } else {
      setStep("import-confirm");
    }
  };

  const handleImport = async (strategy: ImportStrategy) => {
    if (!validation?.file) return;
    setStep("importing");
    setProgress(2);
    setProgressMsg("Pripremam uvoz…");
    const slice: ImportSlice = cardsOnly ? "cards-and-taxonomy" : "full";
    try {
      await onImport(validation.file, strategy, onProgress, slice);
      setProgress(100);
      setProgressMsg("Završeno.");
    } finally {
      handleOpenChange(false);
    }
  };

  const sliceToggle = (
    <div className="rounded-lg border bg-muted/30 p-3 flex items-start gap-3">
      <Checkbox
        id="import-cards-only"
        checked={cardsOnly}
        onCheckedChange={(v) => setCardsOnly(v === true)}
        className="mt-0.5"
      />
      <div className="space-y-1">
        <Label htmlFor="import-cards-only" className="text-sm font-medium cursor-pointer">
          Samo kartice + taksonomija
        </Label>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Uvozi isključivo kartice i strukturu predmeta (podkategorije, glave).
          Postojeći Sources, Mind Maps, Knowledge Base, Mnemonics, logovi i
          podešavanja ostaju nepromijenjeni.
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={step === "import-conflict" ? "sm:max-w-lg" : "sm:max-w-md"}>
        {step === "menu" && (
          <MenuStep onPickExport={() => setStep("export")} onFileSelected={handleFileSelected} />
        )}

        {step === "export" && (
          <ExportStep
            cardsCount={cards.length}
            compress={compress}
            onCompressChange={setCompress}
            onExportTemplate={handleExportTemplate}
            onExportFull={handleExportFull}
            onBack={() => setStep("menu")}
          />
        )}

        {(step === "exporting" || step === "import-validating" || step === "importing") && (
          <ProgressStep progress={progress} message={progressMsg} />
        )}

        {step === "import-confirm" && validation && (
          <ImportConfirmStep
            validation={validation}
            currentCardsCount={cards.length}
            onConfirm={() => handleImport("skip")}
            onCancel={reset}
            extraControls={validation.valid ? sliceToggle : null}
          />
        )}

        {step === "import-conflict" && validation && (
          <ImportConflictStep
            validation={validation}
            onChoose={handleImport}
            onCancel={reset}
            extraControls={sliceToggle}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

