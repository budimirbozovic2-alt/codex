import { AlertTriangle, Check, Clock, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { ImportValidation, ImportStrategy } from "./types";

interface Props {
  validation: ImportValidation;
  onChoose: (strategy: ImportStrategy) => void;
  onCancel: () => void;
}

export function ImportConflictStep({ validation, onChoose, onCancel }: Props) {
  return (
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
        <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={() => onChoose("newer")}>
          <Clock className="h-5 w-5 text-primary" />
          <div className="text-left">
            <p className="font-medium">Pametno spajanje (Preporučeno)</p>
            <p className="text-xs text-muted-foreground">Zadrži noviji progres za kartice, spoji predmete</p>
          </div>
        </Button>
        <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={() => onChoose("keep")}>
          <Check className="h-5 w-5 text-success" />
          <div className="text-left">
            <p className="font-medium">Dodaj samo nove (Merge)</p>
            <p className="text-xs text-muted-foreground">Postojeće kartice i predmeti ostaju netaknuti, dodaju se samo nove</p>
          </div>
        </Button>
        <Button variant="outline" className="justify-start gap-3 h-auto py-4 border-destructive/40 hover:bg-destructive/5" onClick={() => onChoose("overwrite")}>
          <Download className="h-5 w-5 text-destructive" />
          <div className="text-left">
            <p className="font-medium text-destructive">Prepiši sve (Overwrite)</p>
            <p className="text-xs text-muted-foreground">Oprez: Duplikati i predmeti će biti prepisani podacima iz fajla</p>
          </div>
        </Button>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Otkaži</Button>
      </DialogFooter>
    </>
  );
}
