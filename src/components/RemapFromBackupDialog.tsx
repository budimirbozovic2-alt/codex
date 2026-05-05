import { useState, useCallback, useRef } from "react";
import { Upload, FileJson, AlertTriangle, CheckCircle2, Loader2, Wand2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { remapFromBackup, type BackupRemapReport } from "@/lib/migrations/remap-from-backup";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";

interface RemapFromBackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
}

type Phase = "idle" | "parsing" | "analyzed" | "applying" | "done";

async function readFileAsJson(file: File): Promise<unknown> {
  // Delegate to the shared zip-service: ZIP decompression and large-payload
  // JSON.parse both run off the main thread, with main-thread fallbacks.
  const { parseJsonInWorker } = await import("@/lib/zip-service");
  return parseJsonInWorker(file);
}

export default function RemapFromBackupDialog({
  open,
  onOpenChange,
  onApplied,
}: RemapFromBackupDialogProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState<string>("");
  const [report, setReport] = useState<BackupRemapReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const parsedJsonRef = useRef<unknown>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setFileName("");
    setReport(null);
    setError(null);
    parsedJsonRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setReport(null);
    setFileName(file.name);
    setPhase("parsing");
    try {
      const json = await readFileAsJson(file);
      parsedJsonRef.current = json;
      const dryReport = await remapFromBackup(json, { dryRun: true });
      setReport(dryReport);
      if (dryReport.errors.length > 0) {
        setError(dryReport.errors.join(" "));
        setPhase("idle");
        return;
      }
      setPhase("analyzed");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nepoznata greška pri parsiranju fajla."
      );
      setPhase("idle");
    }
  }, []);

  const handleApply = useCallback(async () => {
    if (!parsedJsonRef.current) return;
    setPhase("applying");
    try {
      const finalReport = await remapFromBackup(parsedJsonRef.current, { dryRun: false });
      setReport(finalReport);
      setPhase("done");
      const total =
        finalReport.remappedSubcategory +
        finalReport.remappedChapter +
        finalReport.resetSubcategory +
        finalReport.resetChapter;
      if (finalReport.errors.length > 0) {
        toast.error("Remap završen sa greškama", {
          description: finalReport.errors.join(" "),
        });
      } else {
        toast.success(`Remap uspješan: ${total} izmjena na karticama.`);
      }
      eventBus.emit(EVENT_TYPES.CARDS_UPDATED, { source: "remap-from-backup" });
      onApplied?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška pri primjeni remapa.");
      setPhase("analyzed");
    }
  }, [onApplied]);

  const handleClose = useCallback(() => {
    reset();
    onOpenChange(false);
  }, [reset, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Remap iz backupa
          </DialogTitle>
          <DialogDescription>
            Učitaj raniji JSON ili ZIP backup. Aplikacija će po imenima podkategorija i
            glava povezati tvoje kartice sa trenutnom strukturom (UUID-jevi se osvježavaju).
            Mijenjaju se samo veze — pitanja, odgovori i FSRS stanje ostaju netaknuti.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* File picker */}
          <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 p-4">
            <input
              ref={inputRef}
              type="file"
              accept=".json,.zip,application/json,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <div className="flex items-center gap-3">
              <FileJson className="h-8 w-8 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {fileName || "Izaberi backup fajl"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Podržano: .json, .zip (codex-backup-*)
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={phase === "parsing" || phase === "applying"}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                {fileName ? "Promijeni" : "Izaberi"}
              </Button>
            </div>
          </div>

          {/* Status: parsing */}
          {phase === "parsing" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analiziram backup…
            </div>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Greška</AlertTitle>
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {/* Report */}
          {report && phase !== "parsing" && (
            <Alert
              className={
                phase === "done"
                  ? "border-success/50 bg-success/10"
                  : "border-primary/40 bg-primary/5"
              }
            >
              {phase === "done" ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <FileJson className="h-4 w-4 text-primary" />
              )}
              <AlertTitle>
                {phase === "done" ? "Remap završen" : "Pregled prije primjene"}
              </AlertTitle>
              <AlertDescription>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mt-2">
                  <span className="text-muted-foreground">Kartica u backupu:</span>
                  <span className="font-medium text-right">{report.cardsInBackup}</span>

                  <span className="text-muted-foreground">Match-ovano u bazi:</span>
                  <span className="font-medium text-right">{report.matchedCards}</span>

                  <span className="text-muted-foreground">Nove podkategorije:</span>
                  <span className="font-medium text-right text-primary">
                    {report.remappedSubcategory}
                  </span>

                  <span className="text-muted-foreground">Nove glave:</span>
                  <span className="font-medium text-right text-primary">
                    {report.remappedChapter}
                  </span>

                  <span className="text-muted-foreground">Reset (sub bez para):</span>
                  <span className="font-medium text-right text-warning">
                    {report.resetSubcategory}
                  </span>

                  <span className="text-muted-foreground">Reset (glave bez para):</span>
                  <span className="font-medium text-right text-warning">
                    {report.resetChapter}
                  </span>

                  <span className="text-muted-foreground">Bez izmjena:</span>
                  <span className="font-medium text-right">{report.unchanged}</span>
                </div>
                {phase === "analyzed" && (
                  <div className="text-xs text-muted-foreground pt-2 border-t mt-2">
                    Klikom na <Badge variant="outline" className="text-[10px] mx-0.5">Primijeni remap</Badge>
                    izmjene će biti zapisane u IndexedDB.
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            {phase === "done" ? "Zatvori" : "Otkaži"}
          </Button>
          {phase === "analyzed" && (
            <Button onClick={handleApply} className="gap-1.5">
              <Wand2 className="h-3.5 w-3.5" />
              Primijeni remap
            </Button>
          )}
          {phase === "applying" && (
            <Button disabled className="gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Primjenjujem…
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
