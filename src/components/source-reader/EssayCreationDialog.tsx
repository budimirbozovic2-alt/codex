import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Source } from "@/lib/sources-storage";

/**
 * Props for the EssayCreationDialog component.
 */
interface Props {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the open state changes */
  onOpenChange: (open: boolean) => void;
  /** The question for the essay card */
  essayQuestion: string;
  /** Callback to update the essay question */
  setEssayQuestion: (val: string) => void;
  /** The selected text from the source (the answer) */
  selectedText: string;
  /** The source being read */
  source: Source;
  /** Callback to create the essay card */
  onCreateEssay: () => void;
}

/**
 * Dialog for creating a new essay card from a text selection.
 */
export function EssayCreationDialog({ open, onOpenChange, essayQuestion, setEssayQuestion, selectedText, source, onCreateEssay }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Kreiraj esejsko pitanje</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium">Pitanje</label>
            <textarea value={essayQuestion} onChange={e => setEssayQuestion(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px] resize-none"
              placeholder="Unesite pitanje za esej..." autoFocus />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Označeni tekst (odgovor)</label>
            <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/50 p-3">
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">{selectedText}</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
            Kategorija se dodjeljuje automatski iz izvora.
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
            <Badge variant="outline" className="text-[10px]">Backlink</Badge>
            <span>Kartica će biti automatski povezana sa izvorom "{source.title}"</span>
          </div>
          <Button onClick={onCreateEssay} disabled={!essayQuestion.trim()} className="w-full">
            Kreiraj esejsko pitanje
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
