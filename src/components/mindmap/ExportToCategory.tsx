import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCategoryData } from "@/contexts/AppContext";
import { saveMindMap } from "@/lib/mindmap-storage";
import { MindMapDoc } from "@/lib/db";
import type { Node, Edge } from "@xyflow/react";
import { toast } from "sonner";
import { FolderDown } from "lucide-react";
import { afterDialogClose } from "@/lib/dialog-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTitle: string;
  currentNodes: Node[];
  currentEdges: Edge[];
  mode: "hierarchy" | "procedure";
}

export default function ExportToCategory({ open, onOpenChange, currentTitle, currentNodes, currentEdges, mode }: Props) {
  const { categoryRecords } = useCategoryData();
  const [title, setTitle] = useState(currentTitle);
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);

  const handleExport = async () => {
    if (!categoryId) {
      toast.error("Odaberite predmet.");
      return;
    }
    setSaving(true);
    try {
      // Strip callback refs from node data
      const cleanNodes = currentNodes.map(({ data, ...rest }) => {
        const { onUpdate, onDuplicate, ...cleanData } = data as Record<string, unknown>;
        return { ...rest, data: cleanData };
      });

      const snapshot: MindMapDoc = {
        id: crypto.randomUUID(),
        categoryId,
        title: title || currentTitle,
        mode,
        nodes: cleanNodes,
        edges: currentEdges,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveMindMap(snapshot);
      onOpenChange(false);
      afterDialogClose(() => toast.success("Mapa eksportovana u predmet."));
    } catch (err) {
      toast.error("Greška pri eksportu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderDown className="h-5 w-5 text-primary" />
            Eksportuj u Predmet
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Naziv mape</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Naziv mentalne mape..." />
          </div>
          <div className="space-y-2">
            <Label>Predmet (kategorija)</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Odaberite predmet..." />
              </SelectTrigger>
              <SelectContent>
                {categoryRecords.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <span className="flex items-center gap-2">
                      {cat.color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />}
                      {cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Otkaži</Button>
          <Button onClick={handleExport} disabled={saving || !categoryId}>
            {saving ? "Eksportujem..." : "Eksportuj"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
