import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/lib/spaced-repetition";
import { Download, Upload, FileBox, Package, AlertTriangle, Check } from "lucide-react";

interface ExportImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExportTemplate: () => void;
  onExportFull: () => void;
  onImport: (file: File, strategy: "keep" | "overwrite" | "skip" | "newer") => void;
  cards: Card[];
}

type Step = "menu" | "export" | "import-pick" | "import-conflict";

interface ConflictInfo {
  file: File;
  newCount: number;
  duplicateCount: number;
  uniqueCount: number;
}

export default function ExportImportDialog({ open, onOpenChange, onExportTemplate, onExportFull, onImport, cards }: ExportImportDialogProps) {
  const [step, setStep] = useState<Step>("menu");
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setStep("menu"); setConflict(null); };
  const handleOpenChange = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const handleExportTemplate = () => { onExportTemplate(); handleOpenChange(false); };
  const handleExportFull = () => { onExportFull(); handleOpenChange(false); };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const importedCards: any[] = parsed.cards || [];
        const existingIds = new Set(cards.map(c => c.id));
        const duplicateCount = importedCards.filter(c => existingIds.has(c.id)).length;
        const uniqueCount = importedCards.length - duplicateCount;

        if (duplicateCount > 0) {
          setConflict({ file, newCount: importedCards.length, duplicateCount, uniqueCount });
          setStep("import-conflict");
        } else {
          onImport(file, "skip");
          handleOpenChange(false);
        }
      } catch {
        alert("Greška: neispravan JSON fajl.");
      }
    };
    reader.readAsText(file);
  };

  const handleConflictChoice = (strategy: "keep" | "overwrite" | "newer") => {
    if (conflict?.file) {
      onImport(conflict.file, strategy === "newer" ? "newer" : strategy);
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
                  <p className="text-xs text-muted-foreground">Uvezite iz JSON fajla</p>
                </div>
              </Button>
            </div>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
          </>
        )}

        {step === "export" && (
          <>
            <DialogHeader>
              <DialogTitle>Izaberite tip exporta</DialogTitle>
              <DialogDescription>Odaberite šta želite da izvezete.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
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

        {step === "import-conflict" && conflict && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Pronađene duplikate
              </DialogTitle>
              <DialogDescription>
                Od {conflict.newCount} kartica u fajlu, {conflict.duplicateCount} već postoji u vašoj bazi.
                {conflict.uniqueCount > 0 && ` ${conflict.uniqueCount} novih kartica će biti dodato.`}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={() => handleConflictChoice("newer")}>
                <Clock className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium">Zadrži noviji progres</p>
                  <p className="text-xs text-muted-foreground">Za svaku karticu — zadrži onu koja je novije ponavljana</p>
                </div>
              </Button>
              <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={() => handleConflictChoice("keep")}>
                <Check className="h-5 w-5 text-success" />
                <div className="text-left">
                  <p className="font-medium">Zadrži moj progres</p>
                  <p className="text-xs text-muted-foreground">Postojeće kartice ostaju nepromijenjene, dodaju se samo nove</p>
                </div>
              </Button>
              <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={() => handleConflictChoice("overwrite")}>
                <Download className="h-5 w-5 text-destructive" />
                <div className="text-left">
                  <p className="font-medium">Osvježi iz fajla</p>
                  <p className="text-xs text-muted-foreground">Duplikati će biti zamijenjeni podacima iz fajla</p>
                </div>
              </Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setStep("menu"); setConflict(null); }}>Otkaži</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
