import { Download, Upload, FileBox, Package, AlertTriangle, Check, Clock, FileArchive, Loader2, ShieldCheck, Wand2 } from "lucide-react";
import { useState, useRef, useCallback } from "react";

import { db } from "@/lib/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/lib/spaced-repetition";
import { yieldUI } from "@/lib/backup/yield-ui";
import { migrateRaw, BackupVersionError, BACKUP_SCHEMA_VERSION } from "@/lib/backup/migrate";


import { Switch } from "@/components/ui/switch";
interface ExportImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExportTemplate: (compress: boolean, onProgress: (p: number, msg: string) => void) => Promise<void>;
  onExportFull: (compress: boolean, onProgress: (p: number, msg: string) => void) => Promise<void>;
  onImport: (file: File, strategy: "keep" | "overwrite" | "skip" | "newer", onProgress?: (p: number, msg: string) => void) => Promise<void>;
  cards: Card[];
}

type Step = "menu" | "export" | "exporting" | "import-pick" | "import-validating" | "import-confirm" | "import-conflict" | "importing";

interface ImportValidation {
  file: File;
  totalCards: number;
  totalCategories: number;
  hasProgress: boolean;
  type: string;
  fileSizeKB: number;
  duplicateCount: number;
  duplicateCategoryCount: number;
  uniqueCount: number;
  valid: boolean;
  errors: string[];
  fileVersion: number | null;
  appVersion: number;
  willMigrate: boolean;
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
      // Off-thread parse: ZIP decompression + JSON.parse run in the worker,
      // so the validation step keeps the UI responsive on 100MB+ backups.
      setProgressMsg(file.name.endsWith(".zip") ? "Dekompresija ZIP fajla..." : "Parsiranje podataka...");
      setProgress(40);
      const { parseJsonInWorker } = await import("@/lib/zip-service");
      let parsed = (await parseJsonInWorker(file)) as Record<string, unknown>;

      // Pre-validation migration: surface schema-version mismatches early
      // and inject defaults so legacy backups don't fail downstream.
      const rawFileVersion = typeof parsed.version === "number" && Number.isFinite(parsed.version)
        ? Math.floor(parsed.version)
        : null;
      let willMigrate = false;
      let versionError: string | null = null;
      try {
        const migrated = migrateRaw(parsed) as Record<string, unknown>;
        if (rawFileVersion !== null && rawFileVersion < BACKUP_SCHEMA_VERSION) willMigrate = true;
        parsed = migrated;
      } catch (err) {
        if (err instanceof BackupVersionError) versionError = err.message;
        else versionError = err instanceof Error ? err.message : "Migracija backupa nije uspjela.";
      }

      setProgressMsg("Validacija podataka...");
      setProgress(60);
      await yieldUI();
      const errors: string[] = [];
      if (versionError) errors.push(versionError);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isValidUUID = (id: unknown): id is string => typeof id === 'string' && uuidRegex.test(id);

      // Validate structure
      if (!parsed || typeof parsed !== "object") {
        errors.push("Fajl ne sadrži validan JSON objekat.");
      }

      // Validate Categories Schema (backward compatible with legacy string[])
      const isLegacyCategoryFormat = parsed.categories && Array.isArray(parsed.categories) &&
        parsed.categories.length > 0 && typeof parsed.categories[0] === 'string';

      if (parsed.categories && Array.isArray(parsed.categories) && !isLegacyCategoryFormat) {
        for (let i = 0; i < parsed.categories.length; i++) {
          const cat = parsed.categories[i];
          if (!isValidUUID(cat.id)) {
            errors.push(`Kategorija '${cat.name || 'Nepoznato'}' nema validan UUID (id).`);
            break;
          }
        }
      }

      // Validate Cards Schema (sanitization happens in useCardImport)
      const importedCards: Array<Record<string, unknown>> = (parsed.cards as Array<Record<string, unknown>>) || [];

      if (importedCards.length > 0) {
        const cTotal = importedCards.length;
        for (let i = 0; i < cTotal; i++) {
          const c = importedCards[i];
          if (!isValidUUID(c.id)) {
            errors.push(`Kartica na indeksu ${i} nema validan UUID (id).`);
            break;
          }
          if (c.categoryId !== undefined && !isValidUUID(c.categoryId)) {
            errors.push(`Kartica '${String(c.question ?? '').substring(0, 15)}...' ima neispravan categoryId UUID.`);
            break;
          }
          if (!Array.isArray(c.sections)) {
            errors.push(`Kartica na indeksu ${i} nema validan 'sections' niz.`);
            break;
          }
          if (i > 0 && i % 1000 === 0) {
            setProgress(60 + Math.round((i / cTotal) * 10));
            setProgressMsg(`Validacija kartica ${i}/${cTotal}…`);
            await yieldUI();
          }
        }
      } else if (!parsed.categories && !parsed.mindMaps) {
        errors.push("Fajl ne sadrži podatke za import (cards, categories, ili mindMaps).");
      }

      // Validate Sources Schema (if present)
      if (parsed.sources && Array.isArray(parsed.sources)) {
        const sTotal = parsed.sources.length;
        for (let i = 0; i < sTotal; i++) {
          const s = parsed.sources[i];
          if (!isValidUUID(s.id) || !isValidUUID(s.categoryId)) {
            errors.push(`Izvor '${s.title || 'Nepoznato'}' nema validne UUID ključeve.`);
            break;
          }
          if (i > 0 && i % 1000 === 0) await yieldUI();
        }
      }

      // Validate MindMaps Schema (if present)
      if (parsed.mindMaps && Array.isArray(parsed.mindMaps)) {
        for (let i = 0; i < parsed.mindMaps.length; i++) {
          const m = parsed.mindMaps[i];
          if (!isValidUUID(m.id)) {
            errors.push(`Mentalna mapa '${m.title || 'Nepoznato'}' nema validan UUID.`);
            break;
          }
        }
      }

      // --- STEP 2: RELATIONAL INTEGRITY GUARD ---
      setProgress(72);
      setProgressMsg("Provjera relacionog integriteta…");
      await yieldUI();
      const existingCats = await db.categories.toArray();
      if (errors.length === 0) {
        const validCategoryIds = new Set<string>();
        if (parsed.categories && Array.isArray(parsed.categories)) {
          if (isLegacyCategoryFormat) {
            // Legacy string[] — skip FK check for categories (no UUIDs to validate against)
          } else {
            (parsed.categories as Array<{ id: string }>).forEach((cat) => validCategoryIds.add(cat.id));
          }
        }
        existingCats.forEach(cat => validCategoryIds.add(cat.id));

        const skipFKCheck = isLegacyCategoryFormat;

        if (!skipFKCheck && importedCards.length > 0) {
          const cTotal = importedCards.length;
          for (let i = 0; i < cTotal; i++) {
            const c = importedCards[i];
            if (typeof c.categoryId === 'string' && !validCategoryIds.has(c.categoryId)) {
              errors.push(`Kartica '${String(c.question ?? '').substring(0,15)}...' pripada predmetu koji ne postoji u bazi ni u fajlu.`);
              break;
            }
            if (i > 0 && i % 2000 === 0) await yieldUI();
          }
        }
        if (!skipFKCheck && parsed.sources && Array.isArray(parsed.sources)) {
          for (let i = 0; i < parsed.sources.length; i++) {
            const s = parsed.sources[i];
            if (s.categoryId && !validCategoryIds.has(s.categoryId)) {
              errors.push(`Izvor '${s.title?.substring(0,15)}...' pripada predmetu koji ne postoji.`);
              break;
            }
            if (i > 0 && i % 2000 === 0) await yieldUI();
          }
        }
      }
      // --- END RELATIONAL INTEGRITY GUARD ---

      setProgress(82);

      const freshCards = await db.cards.toArray();
      const existingIds = new Set(freshCards.map(c => c.id));
      const duplicateCount = importedCards.filter(c => typeof c.id === 'string' && existingIds.has(c.id)).length;

      // Category conflict detection (reuse existingCats from above)
      const existingCatIds = new Set(existingCats.map(c => c.id));
      const existingCatNames = new Set(existingCats.map(c => c.name.toLowerCase()));
      const duplicateCategoryCount = Array.isArray(parsed.categories)
        ? (parsed.categories as Array<{ id?: string; name?: string }>).filter((c) =>
            (c.id !== undefined && existingCatIds.has(c.id)) ||
            (c.name !== undefined && existingCatNames.has(c.name.toLowerCase()))
          ).length
        : 0;

      const validationResult: ImportValidation = {
        file,
        totalCards: importedCards.length,
        totalCategories: Array.isArray(parsed.categories) ? parsed.categories.length : 0,
        hasProgress: parsed.type === "full",
        type: (typeof parsed.type === 'string' ? parsed.type : "unknown"),
        fileSizeKB: Math.round(file.size / 1024),
        duplicateCount,
        duplicateCategoryCount,
        uniqueCount: importedCards.length - duplicateCount,
        valid: errors.length === 0,
        errors,
        fileVersion: rawFileVersion,
        appVersion: BACKUP_SCHEMA_VERSION,
        willMigrate,
      };

      setValidation(validationResult);
      setProgress(100);

      if (!validationResult.valid) {
        setStep("import-confirm");
      } else if (duplicateCount > 0 || duplicateCategoryCount > 0) {
        setStep("import-conflict");
      } else {
        setStep("import-confirm");
      }
    } catch (err) {
      setValidation({
        file, totalCards: 0, totalCategories: 0, hasProgress: false,
        type: "unknown", fileSizeKB: Math.round(file.size / 1024),
        duplicateCount: 0, duplicateCategoryCount: 0, uniqueCount: 0, valid: false,
        errors: [`Greška pri čitanju fajla: ${err instanceof Error ? err.message : "Neispravan format"}`],
        fileVersion: null, appVersion: BACKUP_SCHEMA_VERSION, willMigrate: false,
      });
      setStep("import-confirm");
    }
  };

  const handleImport = async (strategy: "keep" | "overwrite" | "skip" | "newer") => {
    if (!validation?.file) return;
    // Switch to in-dialog progress view; await the actual import so the dialog
    // can't lie about completion. `onImport` (useCardImport.importData) owns
    // its own success/error toast so we don't double-fire.
    setStep("importing");
    setProgress(2);
    setProgressMsg("Pripremam uvoz…");
    try {
      // Real progress wired through from useCardImport (no fake interval).
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
              <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={async () => {
                if (window.electronAPI?.showOpenDialog) {
                  const result = await window.electronAPI.showOpenDialog({
                    filters: [{ name: 'Codex Backup', extensions: ['json', 'zip'] }],
                    properties: ['openFile'],
                  });
                  if (result.canceled || !result.filePaths?.length) return;
                  const fileResult = await window.electronAPI.readFile(result.filePaths[0]);
                  if (!fileResult) return;
                  const bytes = Uint8Array.from(atob(fileResult.data), c => c.charCodeAt(0));
                  const file = new File([bytes], fileResult.name);
                  const fakeEvent = { target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;
                  handleFileSelect(fakeEvent);
                } else {
                  fileRef.current?.click();
                }
              }}>
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
                  {/* Schema version row */}
                  <div className="flex items-center gap-2 pt-2 mt-2 border-t text-xs">
                    {validation.willMigrate ? (
                      <>
                        <Wand2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <span className="text-muted-foreground">Šema fajla:</span>
                        <span className="font-medium">
                          v{validation.fileVersion} → v{validation.appVersion}
                        </span>
                        <span className="text-primary">(auto-migracija)</span>
                      </>
                    ) : validation.fileVersion !== null ? (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5 text-success flex-shrink-0" />
                        <span className="text-muted-foreground">Šema fajla:</span>
                        <span className="font-medium">v{validation.fileVersion}</span>
                        <span className="text-muted-foreground">(najnovija)</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-3.5 w-3.5 text-warning flex-shrink-0" />
                        <span className="text-muted-foreground">Šema fajla nije označena — koristi se v{validation.appVersion}.</span>
                      </>
                    )}
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
                Pronađeno je preklapanje! Od {validation.totalCards.toLocaleString()} kartica, {validation.duplicateCount.toLocaleString()} već postoji.
                {validation.duplicateCategoryCount > 0 && ` Pronađeno je i preklapanje kod ${validation.duplicateCategoryCount} predmeta.`}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={() => handleImport("newer")}>
                <Clock className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium">Pametno spajanje (Preporučeno)</p>
                  <p className="text-xs text-muted-foreground">Zadrži noviji progres za kartice, spoji predmete</p>
                </div>
              </Button>
              <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={() => handleImport("keep")}>
                <Check className="h-5 w-5 text-success" />
                <div className="text-left">
                  <p className="font-medium">Dodaj samo nove (Merge)</p>
                  <p className="text-xs text-muted-foreground">Postojeće kartice i predmeti ostaju netaknuti, dodaju se samo nove</p>
                </div>
              </Button>
              <Button variant="outline" className="justify-start gap-3 h-auto py-4 border-destructive/40 hover:bg-destructive/5" onClick={() => handleImport("overwrite")}>
                <Download className="h-5 w-5 text-destructive" />
                <div className="text-left">
                  <p className="font-medium text-destructive">Prepiši sve (Overwrite)</p>
                  <p className="text-xs text-muted-foreground">Oprez: Duplikati i predmeti će biti prepisani podacima iz fajla</p>
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
