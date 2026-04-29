import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Source } from "@/lib/sources-storage";
import { useSourceReaderStore } from "@/store/useSourceReaderStore";
import { sanitizeHtml } from "@/lib/sanitize";
import { useMemo } from "react";

interface Props {
  source: Source;
  onCreateEssay: () => void;
}

export function EssayCreationDialog({ source, onCreateEssay }: Props) {
  const open = useSourceReaderStore(s => s.essayDialogOpen);
  const setOpen = useSourceReaderStore(s => s.setEssayDialogOpen);
  const essayQuestion = useSourceReaderStore(s => s.essayQuestion);
  const setEssayQuestion = useSourceReaderStore(s => s.setEssayQuestion);
  const selectedText = useSourceReaderStore(s => s.selectedText);
  const selectedHtml = useSourceReaderStore(s => s.selectedHtml);

  const previewHtml = useMemo(
    () => sanitizeHtml(selectedHtml || selectedText),
    [selectedHtml, selectedText],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Kreiraj esejsko pitanje</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium">Pitanje</label>
            <textarea value={essayQuestion} onChange={e => setEssayQuestion(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-none"
              placeholder="Unesite pitanje za esej..." autoFocus />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Označeni tekst (odgovor)</label>
            <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/50 p-3">
              <div
                className="text-sm prose prose-sm max-w-none card-prose"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
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
