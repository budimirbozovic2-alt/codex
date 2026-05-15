import { useState, useCallback, useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { type CategoryRecord } from "@/lib/db";
import type { Card } from "@/lib/spaced-repetition";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { afterDialogClose } from "@/lib/dialog-utils";


interface AddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  addCard: (question: string, sections: { title: string; content: string }[], category: string, subcategory?: string, chapter?: string) => Card;
  addFlashCard: (question: string, answer: string, category: string, subcategory?: string) => Card;
  /** Initial creation mode. Re-applied each time the dialog opens. */
  defaultMode?: "essay" | "flash";
}

export function AddCardDialog({ open, onOpenChange, categoryId, addCard, addFlashCard, defaultMode = "flash" }: AddDialogProps) {
  const [addMode, setAddMode] = useState<"essay" | "flash">(defaultMode);
  // Re-sync the mode whenever the dialog is (re)opened so that
  // "Dodaj esej" vs "Dodaj blic pitanje" land on the correct tab.
  useEffect(() => {
    if (open) setAddMode(defaultMode);
  }, [open, defaultMode]);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [newSectionTitle, setNewSectionTitle] = useState("Odgovor");
  const [newSectionContent, setNewSectionContent] = useState("");

  const handleSave = useCallback(() => {
    if (!newQuestion.trim()) return;
    if (addMode === "flash" && !newAnswer.trim()) return;
    if (addMode === "essay" && !newSectionContent.trim()) return;
    // Snapshot lokalnih vrijednosti prije resetа.
    const q = newQuestion.trim();
    const a = newAnswer.trim();
    const st = newSectionTitle.trim() || "Odgovor";
    const sc = newSectionContent.trim();
    const mode = addMode;
    // Root-cause: zatvori dijalog PRVO, pa odgodi mutaciju globalnog state-a
    // (addCard / addFlashCard mijenjaju AppContext + IDB) i toast portal —
    // to izbjegava Radix focus race koji ostavlja pointer-events: none.
    onOpenChange(false);
    setNewQuestion(""); setNewAnswer(""); setNewSectionTitle("Odgovor"); setNewSectionContent("");
    afterDialogClose(() => {
      if (mode === "flash") {
        addFlashCard(q, a, categoryId);
      } else {
        addCard(q, [{ title: st, content: sc }], categoryId);
      }
      toast.success("Kartica kreirana.");
    });
  }, [addMode, newQuestion, newAnswer, newSectionTitle, newSectionContent, categoryId, addCard, addFlashCard, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova kartica</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-0.5 rounded-md border p-0.5 w-fit">
            <button onClick={() => setAddMode("flash")} className={cn("px-3 py-1 rounded text-xs font-medium transition-colors", addMode === "flash" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              Blic
            </button>
            <button onClick={() => setAddMode("essay")} className={cn("px-3 py-1 rounded text-xs font-medium transition-colors", addMode === "essay" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              Esej
            </button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Pitanje</Label>
            <Input value={newQuestion} onChange={e => setNewQuestion(e.target.value)} placeholder="Unesite pitanje..." />
          </div>

          {addMode === "flash" ? (
            <div className="space-y-2">
              <Label className="text-xs">Odgovor</Label>
              <Textarea value={newAnswer} onChange={e => setNewAnswer(e.target.value)} placeholder="Unesite odgovor..." rows={4} />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-xs">Naslov sekcije</Label>
                <Input value={newSectionTitle} onChange={e => setNewSectionTitle(e.target.value)} placeholder="Odgovor" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Sadržaj</Label>
                <Textarea value={newSectionContent} onChange={e => setNewSectionContent(e.target.value)} placeholder="Unesite sadržaj..." rows={6} />
              </div>
            </>
          )}

          <Button onClick={handleSave} className="w-full gap-2" disabled={!newQuestion.trim()}>
            <Plus className="h-4 w-4" /> Sačuvaj
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface MoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  otherCategories: CategoryRecord[];
  onConfirm: (targetCategoryId: string) => void;
}

export function MoveCardDialog({ open, onOpenChange, otherCategories, onConfirm }: MoveDialogProps) {
  const [targetCategoryId, setTargetCategoryId] = useState("");

  const handleConfirm = useCallback(() => {
    if (!targetCategoryId) return;
    const target = targetCategoryId;
    onOpenChange(false);
    setTargetCategoryId("");
    afterDialogClose(() => onConfirm(target));
  }, [targetCategoryId, onConfirm, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Premjesti karticu</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={targetCategoryId} onValueChange={setTargetCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Odaberi kategoriju..." />
            </SelectTrigger>
            <SelectContent>
              {otherCategories.map(cat => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleConfirm} disabled={!targetCategoryId} className="w-full">
            Premjesti
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// `BulkImportWrapper` was removed — mass flashcard import is now triggered
// exclusively via `MassFlashImportTrigger` from `CardCreateMenu`.

