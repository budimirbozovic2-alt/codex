import { useRef } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Props {
  onPickExport: () => void;
  onFileSelected: (file: File) => void;
}

export function MenuStep({ onPickExport, onFileSelected }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImportClick = async () => {
    if (window.electronAPI?.showOpenDialog) {
      const result = await window.electronAPI.showOpenDialog({
        filters: [{ name: "Codex Backup", extensions: ["json", "zip"] }],
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths?.length) return;
      const fileResult = await window.electronAPI.readFile(result.filePaths[0]);
      if (!fileResult) return;
      const bytes = Uint8Array.from(atob(fileResult.data), (c) => c.charCodeAt(0));
      const file = new File([bytes], fileResult.name);
      onFileSelected(file);
    } else {
      fileRef.current?.click();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onFileSelected(file);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Export / Import</DialogTitle>
        <DialogDescription>Izaberite operaciju za upravljanje podacima.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 py-4">
        <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={onPickExport}>
          <Download className="h-5 w-5 text-primary" />
          <div className="text-left">
            <p className="font-medium">Export podataka</p>
            <p className="text-xs text-muted-foreground">Izvezite kartice ili kompletan backup</p>
          </div>
        </Button>
        <Button variant="outline" className="justify-start gap-3 h-auto py-4" onClick={handleImportClick}>
          <Upload className="h-5 w-5 text-primary" />
          <div className="text-left">
            <p className="font-medium">Import podataka</p>
            <p className="text-xs text-muted-foreground">Uvezite iz JSON ili ZIP fajla</p>
          </div>
        </Button>
      </div>
      <input ref={fileRef} type="file" accept=".json,.zip" className="hidden" onChange={handleChange} />
    </>
  );
}
