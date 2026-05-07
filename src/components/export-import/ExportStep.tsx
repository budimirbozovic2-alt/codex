import { FileBox, Package, FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface Props {
  cardsCount: number;
  compress: boolean;
  onCompressChange: (v: boolean) => void;
  onExportTemplate: () => void;
  onExportFull: () => void;
  onBack: () => void;
}

export function ExportStep({ cardsCount, compress, onCompressChange, onExportTemplate, onExportFull, onBack }: Props) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Izaberite tip exporta</DialogTitle>
        <DialogDescription>{cardsCount} kartica spremno za izvoz.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 py-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <FileArchive className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">ZIP kompresija</p>
              <p className="text-xs text-muted-foreground">Smanjuje veličinu fajla do 80%</p>
            </div>
          </div>
          <Switch checked={compress} onCheckedChange={onCompressChange} />
        </div>

        <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={onExportTemplate}>
          <FileBox className="h-5 w-5 text-muted-foreground" />
          <div className="text-left">
            <p className="font-medium">Samo kartice (Template)</p>
            <p className="text-xs text-muted-foreground">Pitanja i odgovori bez progresa — za dijeljenje</p>
          </div>
        </Button>
        <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={onExportFull}>
          <Package className="h-5 w-5 text-primary" />
          <div className="text-left">
            <p className="font-medium">Pun paket (Full Backup)</p>
            <p className="text-xs text-muted-foreground">Kartice + progres, kategorije, statistika</p>
          </div>
        </Button>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onBack}>Nazad</Button>
      </DialogFooter>
    </>
  );
}
