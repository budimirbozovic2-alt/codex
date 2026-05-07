import { useState, useCallback } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card } from "@/lib/spaced-repetition";
import { MenuStep } from "./export-import/MenuStep";
import { ExportStep } from "./export-import/ExportStep";
import { ProgressStep } from "./export-import/ProgressStep";
import { ImportConfirmStep } from "./export-import/ImportConfirmStep";
import { ImportConflictStep } from "./export-import/ImportConflictStep";
import { validateImportFile } from "./export-import/useImportValidation";
import type { Step, ImportValidation, ImportStrategy } from "./export-import/types";

interface ExportImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExportTemplate: (compress: boolean, onProgress: (p: number, msg: string) => void) => Promise<void>;
  onExportFull: (compress: boolean, onProgress: (p: number, msg: string) => void) => Promise<void>;
  onImport: (file: File, strategy: ImportStrategy, onProgress?: (p: number, msg: string) => void) => Promise<void>;
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

  const reset = () => { setStep("menu"); setValidation(null); setProgress(0); setProgressMsg(""); };
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
    try {
      await onImport(validation.file, strategy, onProgress);
      setProgress(100);
      setProgressMsg("Završeno.");
    } finally {
      handleOpenChange(false);
    }
  };

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
          />
        )}

        {step === "import-conflict" && validation && (
          <ImportConflictStep
            validation={validation}
            onChoose={handleImport}
            onCancel={reset}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
