import { useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { type CategoryRecord } from "@/lib/db";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import BulkImportDialog from "./BulkImportDialog";

interface AddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  addCard: (question: string, sections: { title: string; content: string }[], category: string, subcategory?: string, chapter?: string) => any;
  addFlashCard: (question: string, answer: string, category: string, subcategory?: string) => any;
}

export function AddCardDialog({ open, onOpenChange, categoryId, addCard, addFlashCard }: AddDialogProps) {
  const [addMode, setAddMode] = useState<"essay" | "flash">("flash");
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [newSectionTitle, setNewSectionTitle] = useState("Odgovor");
  const [newSectionContent, setNewSectionContent] = useState("");

  const handleSave = useCallback(() => {
    if (!newQuestion.trim()) return;
    if (addMode === "flash") {
      if (!newAnswer.trim()) return;
      addFlashCard(newQuestion.trim(), newAnswer.trim(), categoryId);
    } else {
      if (!newSectionContent.trim()) return;
      addCard(newQuestion.trim(), [{ title: newSectionTitle.trim() || "Odgovor", content: newSectionContent.trim() }], categoryId);
    }
    toast.success("Kartica kreirana.");
    setNewQuestion(""); setNewAnswer(""); setNewSectionTitle("Odgovor"); setNewSectionContent("");
    onOpenChange(false);
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
    onConfirm(targetCategoryId);
    setTargetCategoryId("");
    onOpenChange(false);
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

interface BulkImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  addFlashCard: (question: string, answer: string, category: string, subcategory?: string) => any;
}

export function BulkImportWrapper({ open, onOpenChange, categoryId, addFlashCard }: BulkImportProps) {
  return <BulkImportDialog open={open} onOpenChange={onOpenChange} categoryId={categoryId} addFlashCard={addFlashCard} />;
}
