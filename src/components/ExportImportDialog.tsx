import { useState, useRef, useCallback } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/lib/spaced-repetition";
import { default as Download } from "lucide-react/dist/esm/icons/download";
import { default as Upload } from "lucide-react/dist/esm/icons/upload";
import { default as FileBox } from "lucide-react/dist/esm/icons/file-box";
import { default as Package } from "lucide-react/dist/esm/icons/package";
import { default as AlertTriangle } from "lucide-react/dist/esm/icons/alert-triangle";
import { default as Check } from "lucide-react/dist/esm/icons/check";
import { default as Clock } from "lucide-react/dist/esm/icons/clock";
import { default as FileArchive } from "lucide-react/dist/esm/icons/file-archive";
import { default as Loader2 } from "lucide-react/dist/esm/icons/loader-2";
import { default as ShieldCheck } from "lucide-react/dist/esm/icons/shield-check";
import { Switch } from "@/components/ui/switch";

interface ExportImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExportTemplate: (compress: boolean, onProgress: (p: number, msg: string) => void) => Promise<void>;
  onExportFull: (compress: boolean, onProgress: (p: number, msg: string) => void) => Promise<void>;
  onImport: (file: File, strategy: "keep" | "overwrite" | "skip" | "newer") => void;
  cards: Card[];
}

type Step = "menu" | "export" | "exporting" | "import-pick" | "import-validating" | "import-confirm" | "import-conflict";

interface ImportValidation {
  file: File;
  totalCards: number;
  totalCategories: number;
  hasProgress: boolean;
  type: string;
  fileSizeKB: number;
  duplicateCount: number;
  uniqueCount: number;
  valid: boolean;
  errors: string[];
}

export default function ExportImportDialog({ open, onOpenChange, onExportTemplate, onExportFull, onImport, cards }: ExportImportDialogProps) {
  const [step, setStep] = useState<Step>("menu");
  const [compress, setCompress] = useState(true);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [validation, setValidation] = useState<ImportValidation | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setStep("menu"); setValidation(null); setProgress(0); setProgressMsg(""); };
  const handleOpenChange = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const onProgress = useCallback((p: number, msg: string) => {
    setProgress(p);
    setProgressMsg(msg);
  }, []);

  const handleExportTemplate = async () => {
    setStep("exporting");
    try {
      await onExportTemplate(compress, onProgress);
    } finally {
      handleOpenChange(false);
    }
  };

  const handleExportFull = async () => {
    setStep("exporting");
    try {
      await onExportFull(compress, onProgress);
    } finally {
      handleOpenChange(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setStep("import-validating");
    setProgressMsg("Validacija fajla...");
    setProgress(20);

    try {
      let jsonText: string;

      // Handle .zip files
      if (file.name.endsWith(".zip")) {
        setProgressMsg("Dekompresija ZIP fajla...");
        setProgress(30);
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(file);
        const jsonFile = Object.keys(zip.files).find(n => n.endsWith(".json"));
        if (!jsonFile) throw new Error("ZIP ne sadrži JSON fajl.");
        jsonText = await zip.files[jsonFile].async("string");
      } else {
        jsonText = await file.text();
      }

      setProgressMsg("Parsiranje podataka...");
      setProgress(60);

      // Yield to UI
      await new Promise(r => setTimeout(r, 50));

      const parsed = JSON.parse(jsonText);
      const errors: string[] = [];

      // Validate structure
      if (!parsed || typeof parsed !== "object") {
        errors.push("Fajl ne sadrži validan JSON objekat.");
      }
      if (!Array.isArray(parsed.cards)) {
        errors.push("Fajl ne sadrži 'cards' niz.");
      }

      const importedCards: any[] = (parsed.cards || []).map((c: any) => ({
        ...c,
        question: typeof c.question === "string" ? sanitizeHtml(c.question) : c.question,
        sections: Array.isArray(c.sections)
          ? c.sections.map((s: any) => ({ ...s, content: typeof s.content === "string" ? sanitizeHtml(s.content) : s.content }))
          : c.sections,
      }));

      // Validate individual cards (sample check)
      if (importedCards.length > 0) {
        const sampleSize = Math.min(10, importedCards.length);
        for (let i = 0; i < sampleSize; i++) {
          const c = importedCards[i];
          if (!c.question || typeof c.question !== "string") {
            errors.push(`Kartica #${i + 1} nema validno pitanje.`);
            break;
          }
          if (!Array.isArray(c.sections)) {
            errors.push(`Kartica #${i + 1} nema 'sections' niz.`);
            break;
          }
        }
      }

      setProgress(80);

      const existingIds = new Set(cards.map(c => c.id));
      const duplicateCount = importedCards.filter(c => existingIds.has(c.id)).length;

      const validationResult: ImportValidation = {
        file,
        totalCards: importedCards.length,
        totalCategories: Array.isArray(parsed.categories) ? parsed.categories.length : 0,
        hasProgress: parsed.type === "full",
        type: parsed.type || "unknown",
        fileSizeKB: Math.round(file.size / 1024),
        duplicateCount,
        uniqueCount: importedCards.length - duplicateCount,
        valid: errors.length === 0,
        errors,
      };

      setValidation(validationResult);
      setProgress(100);

      if (!validationResult.valid) {
        setStep("import-confirm");
      } else if (duplicateCount > 0) {
        setStep("import-conflict");
      } else {
        setStep("import-confirm");
      }
    } catch (err) {
      setValidation({
        file, totalCards: 0, totalCategories: 0, hasProgress: false,
        type: "unknown", fileSizeKB: Math.round(file.size / 1024),
        duplicateCount: 0, uniqueCount: 0, valid: false,
        errors: [`Greška pri čitanju fajla: ${err instanceof Error ? err.message : "Neispravan format"}`],
      });
      setStep("import-confirm");
    }
  };

  const handleImport = (strategy: "keep" | "overwrite" | "skip" | "newer") => {
    if (validation?.file) {
      onImport(validation.file, strategy);
    }
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === "menu" && (
          <>
            <DialogHeader>
              <DialogTitle>Export / Import</DialogTitle>
              <DialogDescription>Izaberite operaciju za upravljanje podacima.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={() => setStep("export")}>
                <Download className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium">Export podataka</p>
                  <p className="text-xs text-muted-foreground">Izvezite kartice ili kompletan backup</p>
                </div>
              </Button>
              <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={() => fileRef.current?.click()}>
                <Upload className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium">Import podataka</p>
                  <p className="text-xs text-muted-foreground">Uvezite iz JSON ili ZIP fajla</p>
                </div>
              </Button>
            </div>
            <input ref={fileRef} type="file" accept=".json,.zip" className="hidden" onChange={handleFileSelect} />
          </>
        )}

        {step === "export" && (
          <>
            <DialogHeader>
              <DialogTitle>Izaberite tip exporta</DialogTitle>
              <DialogDescription>{cards.length} kartica spremno za izvoz.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              {/* Compression toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <FileArchive className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">ZIP kompresija</p>
                    <p className="text-xs text-muted-foreground">Smanjuje veličinu fajla do 80%</p>
                  </div>
                </div>
                <Switch checked={compress} onCheckedChange={setCompress} />
              </div>

              <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={handleExportTemplate}>
                <FileBox className="h-5 w-5 text-muted-foreground" />
                <div className="text-left">
                  <p className="font-medium">Samo kartice (Template)</p>
                  <p className="text-xs text-muted-foreground">Pitanja i odgovori bez progresa — za dijeljenje</p>
                </div>
              </Button>
              <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={handleExportFull}>
                <Package className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium">Pun paket (Full Backup)</p>
                  <p className="text-xs text-muted-foreground">Kartice + progres, kategorije, statistika</p>
                </div>
              </Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("menu")}>Nazad</Button>
            </DialogFooter>
          </>
        )}

        {step === "exporting" && (
          <div className="py-8 space-y-4">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-center text-muted-foreground">{progressMsg}</p>
            </div>
          </div>
        )}

        {step === "import-validating" && (
          <div className="py-8 space-y-4">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-center text-muted-foreground">{progressMsg}</p>
            </div>
          </div>
        )}

        {step === "import-confirm" && validation && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {validation.valid ? (
                  <ShieldCheck className="h-5 w-5 text-success" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                )}
                {validation.valid ? "Potvrdi import" : "Greška u fajlu"}
              </DialogTitle>
            </DialogHeader>

            {!validation.valid ? (
              <div className="space-y-3 py-4">
                {validation.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{err}</span>
                  </div>
                ))}
                <DialogFooter>
                  <Button variant="ghost" onClick={reset}>Zatvori</Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4 py-4">
                {/* Summary */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Kartice</p>
                      <p className="font-medium">{validation.totalCards.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Kategorije</p>
                      <p className="font-medium">{validation.totalCategories}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Tip</p>
                      <p className="font-medium">{validation.hasProgress ? "Pun backup" : "Template"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Veličina</p>
                      <p className="font-medium">{validation.fileSizeKB > 1024 ? `${(validation.fileSizeKB / 1024).toFixed(1)} MB` : `${validation.fileSizeKB} KB`}</p>
                    </div>
                  </div>
                </div>

                {/* Warning for large imports */}
                {validation.totalCards > 500 && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                    <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                    <p className="text-muted-foreground">
                      Uvozite <strong className="text-foreground">{validation.totalCards.toLocaleString()}</strong> kartica.
                      {cards.length > 0 && <> Trenutno imate {cards.length.toLocaleString()} kartica u bazi.</>}
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={() => handleImport("skip")} className="flex-1">
                    Potvrdi import
                  </Button>
                  <Button variant="ghost" onClick={reset}>Otkaži</Button>
                </div>
              </div>
            )}
          </>
        )}

        {step === "import-conflict" && validation && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Pronađeni duplikati
              </DialogTitle>
              <DialogDescription>
                Od {validation.totalCards.toLocaleString()} kartica, {validation.duplicateCount.toLocaleString()} već postoji.
                {validation.uniqueCount > 0 && ` ${validation.uniqueCount.toLocaleString()} novih će biti dodato.`}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={() => handleImport("newer")}>
                <Clock className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium">Zadrži noviji progres</p>
                  <p className="text-xs text-muted-foreground">Za svaku karticu — zadrži onu koja je novije ponavljana</p>
                </div>
              </Button>
              <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={() => handleImport("keep")}>
                <Check className="h-5 w-5 text-success" />
                <div className="text-left">
                  <p className="font-medium">Zadrži moj progres</p>
                  <p className="text-xs text-muted-foreground">Postojeće kartice ostaju, dodaju se samo nove</p>
                </div>
              </Button>
              <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={() => handleImport("overwrite")}>
                <Download className="h-5 w-5 text-destructive" />
                <div className="text-left">
                  <p className="font-medium">Osvježi iz fajla</p>
                  <p className="text-xs text-muted-foreground">Duplikati će biti zamijenjeni podacima iz fajla</p>
                </div>
              </Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>Otkaži</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
