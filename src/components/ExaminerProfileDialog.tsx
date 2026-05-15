import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ExaminerProfile, ExaminerDifficulty, PreferredAnswerType } from "@/lib/db";
import { useDirtyDialog } from "@/hooks/useDirtyDialog";
import DirtyConfirmBar from "@/components/ui/dirty-confirm-bar";
import { afterDialogClose } from "@/lib/dialog-utils";

const NONE = "__none__";
const NOTES_MAX = 500;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categoryName: string;
  initialProfile?: ExaminerProfile;
  onSave: (profile: ExaminerProfile) => void;
}

export default function ExaminerProfileDialog({ open, onOpenChange, categoryName, initialProfile, onSave }: Props) {
  const [difficulty, setDifficulty] = useState<string>(initialProfile?.difficulty ?? NONE);
  const [answerType, setAnswerType] = useState<string>(initialProfile?.preferredAnswerType ?? NONE);
  const [notes, setNotes] = useState<string>(initialProfile?.notes ?? "");

  // Resync when dialog opens with new initial values
  useEffect(() => {
    if (open) {
      setDifficulty(initialProfile?.difficulty ?? NONE);
      setAnswerType(initialProfile?.preferredAnswerType ?? NONE);
      setNotes(initialProfile?.notes ?? "");
    }
  }, [open, initialProfile]);

  const initialDifficulty = initialProfile?.difficulty ?? NONE;
  const initialAnswerType = initialProfile?.preferredAnswerType ?? NONE;
  const initialNotes = initialProfile?.notes ?? "";

  const isDirty = useMemo(
    () => difficulty !== initialDifficulty || answerType !== initialAnswerType || notes !== initialNotes,
    [difficulty, answerType, notes, initialDifficulty, initialAnswerType, initialNotes],
  );

  const { pendingClose, requestClose, cancelClose, confirmDiscard } = useDirtyDialog(
    isDirty,
    () => onOpenChange(false),
  );

  const handleSave = () => {
    const trimmed = notes.trim().slice(0, NOTES_MAX);
    const profile: ExaminerProfile = {
      difficulty: difficulty === NONE ? undefined : (difficulty as ExaminerDifficulty),
      preferredAnswerType: answerType === NONE ? undefined : (answerType as PreferredAnswerType),
      notes: trimmed || undefined,
    };
    onOpenChange(false);
    afterDialogClose(() => {
      onSave(profile);
      toast.success("Profil ispitivača sačuvan");
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) requestClose(); else onOpenChange(true); }}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => { if (isDirty) { e.preventDefault(); requestClose(); } }}
        onEscapeKeyDown={(e) => { if (isDirty) { e.preventDefault(); requestClose(); } }}
      >
        <DialogHeader>
          <DialogTitle>Informacije o predmetu</DialogTitle>
          <DialogDescription>
            Profil ispitivača za <span className="text-foreground font-medium">{categoryName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ep-difficulty">Težina ispitivača</Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger id="ep-difficulty">
                <SelectValue placeholder="Nije označeno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nije označeno</SelectItem>
                <SelectItem value="tezak">Težak</SelectItem>
                <SelectItem value="lak">Lak</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ep-answer">Preferirani tip odgovora</Label>
            <Select value={answerType} onValueChange={setAnswerType}>
              <SelectTrigger id="ep-answer">
                <SelectValue placeholder="Nije označeno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nije označeno</SelectItem>
                <SelectItem value="esej">Esej</SelectItem>
                <SelectItem value="definicija">Definicija</SelectItem>
                <SelectItem value="potpitanja">Potpitanja</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ep-notes">Napomena (opcionalno)</Label>
            <Textarea
              id="ep-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
              placeholder="Specifičnosti ispitivanja, omiljene teme, stil pitanja…"
              rows={3}
            />
            <p className="text-xs text-muted-foreground text-right">{notes.length}/{NOTES_MAX}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => requestClose()}>Otkaži</Button>
          <Button onClick={handleSave}>Sačuvaj</Button>
        </DialogFooter>

        <DirtyConfirmBar
          open={pendingClose}
          onCancel={cancelClose}
          onDiscard={confirmDiscard}
          onSave={async () => { handleSave(); }}
        />
      </DialogContent>
    </Dialog>
  );
}
