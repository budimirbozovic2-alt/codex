import { CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/lib/spaced-repetition";
import { highlightKeyParts } from "@/lib/highlight-key-parts";
import { useEffect, useState } from "react";

import { getSource, type Source } from "@/lib/sources-storage";
import { db } from "@/lib/db";
import { toast } from "sonner";
interface Props {
  card: Card;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after confirming review so parent can update local state */
  onReviewConfirmed?: (cardId: string) => void;
}

export default function SourceSnippetDialog({ card, open, onOpenChange, onReviewConfirmed }: Props) {
  const [source, setSource] = useState<Source | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open || !card.sourceId) return;
    getSource(card.sourceId).then(s => setSource(s ?? null));
  }, [open, card.sourceId]);

  if (!card.sourceId || !card.originalSourceSnippet) return null;

  const essayHtml = card.sections.map(s => s.content).join("<hr/>");

  const handleConfirmReview = async () => {
    setConfirming(true);
    try {
      // Update in IndexedDB directly
      await db.cards.update(card.id, { needsReview: undefined });
      onReviewConfirmed?.(card.id);
      toast.success("Kartica potvrđena — oznaka za provjeru uklonjena.");
      onOpenChange(false);
    } catch {
      toast.error("Greška pri potvrđivanju.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Poređenje sa izvorom
            {source && (
              <Badge variant="outline" className="text-[10px]">{source.label} v{source.version}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden">
          {/* Left: user's essay */}
          <div className="flex flex-col min-h-0">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary" />
              Moj esej (formatiran)
            </h4>
            <div className="flex-1 overflow-y-auto rounded-lg border bg-card p-4 prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-ul:text-foreground/90 prose-ol:text-foreground/90 prose-li:text-foreground/90">
              <p className="font-medium text-foreground mb-3">{card.question}</p>
              <div dangerouslySetInnerHTML={{ __html: highlightKeyParts(essayHtml, card.keyParts) }} />
            </div>
          </div>

          {/* Right: original source snippet */}
          <div className="flex flex-col min-h-0">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent" />
              Originalni tekst izvora
            </h4>
            <div className="flex-1 overflow-y-auto rounded-lg border bg-muted/30 p-4">
              <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                {card.originalSourceSnippet}
              </p>
            </div>
          </div>
        </div>

        {card.needsReview && (
          <div className="mt-2 p-3 rounded-md bg-warning/10 border border-warning/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-warning">
              <span>⚠️</span>
              <span>Izvor je ažuriran — provjerite da li je vaš esej još uvijek u skladu sa novim tekstom.</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={confirming}
              className="shrink-0 border-success/50 text-success hover:bg-success/10 hover:text-success"
              onClick={handleConfirmReview}
            >
              <CheckCircle className="h-4 w-4 mr-1.5" />
              Potvrdi provjeru
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
