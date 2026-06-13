import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MenuStep } from "./export-import/MenuStep";
import { ExportStep } from "./export-import/ExportStep";
import { ProgressStep } from "./export-import/ProgressStep";
import { ImportConfirmStep } from "./export-import/ImportConfirmStep";
import { ImportConflictStep } from "./export-import/ImportConflictStep";
import { validateImportFile } from "./export-import/useImportValidation";
import type { 
  Step, 
  ImportValidation, 
  ImportStrategy 
} from "./export-import/types";
import { logger } from "@/lib/logger";

function resolveImportStep(validation: ImportValidation): Step {
  if (!validation.valid) return "import-confirm";
  return validation.duplicateCount > 0 ? "import-conflict" : "import-confirm";
}

interface ExportImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExportTemplate: (
    compress: boolean, 
    onProgress: (p: number, msg: string) => void
  ) => Promise<void>;
  onExportFull: (
    compress: boolean, 
    onProgress: (p: number, msg: string) => void
  ) => Promise<void>;
  onImport: (
    file: File, 
    strategy: ImportStrategy, 
    onProgress?: (p: number, msg: string) => void
  ) => Promise<void>;
  cardsCount: number;
}

export default function ExportImportDialog({
  open, 
  onOpenChange, 
  onExportTemplate, 
  onExportFull, 
  onImport, 
  cardsCount,
}: ExportImportDialogProps) {
  const [step, setStep] = useState<Step>("menu");
  const [compress, setCompress] = useState(true);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [validation, setValidation] = useState<ImportValidation | null>(
    null
  );

  const reset = () => { 
    setStep("menu"); 
    setValidation(null); 
    setProgress(0); 
    setProgressMsg(""); 
  };
  
  const handleOpenChange = (v: boolean) => { 
    if (!v) reset(); 
    onOpenChange(v); 
  };

  const onProgress = useCallback((p: number, msg: string) => {
    setProgress(p);
    setProgressMsg(msg);
  }, []);

  const handleExportTemplate = async () => {
    setStep("exporting");
    try {
      await onExportTemplate(compress, onProgress);
      handleOpenChange(false);
    } catch (err) {
      logger.error("[ExportImportDialog] export template failed", err);
      toast.error("Izvoz template-a nije uspio.");
      setStep("export");
    }
  };

  const handleExportFull = async () => {
    setStep("exporting");
    try {
      await onExportFull(compress, onProgress);
      handleOpenChange(false);
    } catch (err) {
      logger.error("[ExportImportDialog] export full failed", err);
      toast.error("Puni izvoz nije uspio.");
      setStep("export");
    }
  };

  const handleFileSelected = async (file: File) => {
    setStep("import-validating");
    setProgressMsg("Validacija fajla...");
    setProgress(20);
    try {
      const result = await validateImportFile(file, onProgress);
      setValidation(result);
      setStep(resolveImportStep(result));
    } catch (err) {
      logger.error("[ExportImportDialog] validation failed", err);
      const message = err instanceof Error 
        ? err.message 
        : "Nepoznata greška pri validaciji.";
      toast.error(`Validacija nije uspjela: ${message}`);
      setValidation({
        file,
        totalCards: 0,
        totalCategories: 0,
        hasProgress: false,
        type: "unknown",
        fileSizeKB: 0,
        duplicateCount: 0,
        duplicateCategoryCount: 0,
        uniqueCount: 0,
        valid: false,
        errors: [message],
        fileVersion: null,
        appVersion: 0,
        willMigrate: false,
      });
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
      handleOpenChange(false);
    } catch (err) {
      logger.warn("[ExportImportDialog] import failed", err);
      setStep(validation ? resolveImportStep(validation) : "import-confirm");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className={
          step === "import-conflict" ? "sm:max-w-lg" : "sm:max-w-md"
        }
      >
        {step === "menu" && (
          <MenuStep 
            onPickExport={() => setStep("export")} 
            onFileSelected={handleFileSelected} 
          />
        )}

        {step === "export" && (
          <ExportStep
            cardsCount={cardsCount}
            compress={compress}
            onCompressChange={setCompress}
            onExportTemplate={handleExportTemplate}
            onExportFull={handleExportFull}
            onBack={() => setStep("menu")}
          />
        )}

        {(step === "exporting" || 
          step === "import-validating" || 
          step === "importing") && (
          <ProgressStep progress={progress} message={progressMsg} />
        )}

        {step === "import-confirm" && validation && (
          <ImportConfirmStep
            validation={validation}
            currentCardsCount={cardsCount}
            onConfirm={() => handleImport("keep")}
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