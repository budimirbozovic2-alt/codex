import { useEffect, useId, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { afterDialogClose } from "@/lib/dialog-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingTitles: ReadonlySet<string>;
  onConfirm: (title: string) => void;
}

export default function NewArticleDialog({
  open,
  onOpenChange,
  existingTitles,
  onConfirm,
}: Props) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useEffect(() => {
    if (!open) return;
    setTitle("");
    const h = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(h);
  }, [open]);

  const trimmed = title.trim();
  const isDuplicate = trimmed.length > 0 && existingTitles.has(trimmed.toLowerCase());
  const canSubmit = trimmed.length > 0 && !isDuplicate;

  const submit = () => {
    if (!canSubmit) return;
    onOpenChange(false);
    afterDialogClose(() => onConfirm(trimmed));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novi članak</DialogTitle>
          <DialogDescription>
            Unesite naslov novog članka u bazi znanja ovog predmeta.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Naslov članka"
            aria-invalid={isDuplicate || undefined}
            aria-describedby={isDuplicate ? errorId : undefined}
            autoComplete="off"
          />
          {isDuplicate && (
            <p id={errorId} className="mt-2 text-sm text-destructive">
              Članak s tim naslovom već postoji u ovom predmetu.
            </p>
          )}

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Odustani
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Kreiraj
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
