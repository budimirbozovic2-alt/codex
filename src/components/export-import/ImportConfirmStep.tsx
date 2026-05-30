import { AlertTriangle, ShieldCheck, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { ImportValidation } from "./types";

interface Props {
  validation: ImportValidation;
  currentCardsCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImportConfirmStep({ validation, currentCardsCount, onConfirm, onCancel }: Props) {
  return (
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
            <Button variant="ghost" onClick={onCancel}>Zatvori</Button>
          </DialogFooter>
        </div>
      ) : (
        <div className="space-y-4 py-4">
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
            <div className="flex items-center gap-2 pt-2 mt-2 border-t text-xs">
              {validation.willMigrate ? (
                <>
                  <Wand2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Šema fajla:</span>
                  <span className="font-medium">v{validation.fileVersion} → v{validation.appVersion}</span>
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

          {validation.totalCards > 500 && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                Uvozite <strong className="text-foreground">{validation.totalCards.toLocaleString()}</strong> kartica.
                {currentCardsCount > 0 && <> Trenutno imate {currentCardsCount.toLocaleString()} kartica u bazi.</>}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={onConfirm} className="flex-1">Potvrdi import</Button>
            <Button variant="ghost" onClick={onCancel}>Otkaži</Button>
          </div>
        </div>
      )}
    </>
  );
}
