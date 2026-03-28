import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link2, X, Loader2, CheckCircle } from "lucide-react";
import type { AutoLinkPair } from "@/lib/auto-link-suggestion";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  pairs: AutoLinkPair[];
  open: boolean;
  onClose: () => void;
  onLink: (cardId: string, sourceId: string) => void;
}

export default function AutoLinkReviewModal({ pairs, open, onClose, onLink }: Props) {
  const [remaining, setRemaining] = useState<AutoLinkPair[]>(pairs);
  const [linkedCount, setLinkedCount] = useState(0);

  // Sync when pairs change (new scan)
  if (pairs !== remaining && pairs.length > 0 && remaining.length === 0 && linkedCount === 0) {
    setRemaining(pairs);
  }

  const handleLink = useCallback((cardId: string, sourceId: string) => {
    onLink(cardId, sourceId);
    setRemaining(prev => prev.filter(p => p.card.id !== cardId));
    setLinkedCount(c => c + 1);
  }, [onLink]);

  const handleDismiss = useCallback((cardId: string) => {
    setRemaining(prev => prev.filter(p => p.card.id !== cardId));
  }, []);

  const handleClose = () => {
    setLinkedCount(0);
    setRemaining([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Predlozi za uvezivanje
          </DialogTitle>
          <DialogDescription>
            Pronađene su kartice sa sličnim nazivima kao postojeći izvori.
          </DialogDescription>
        </DialogHeader>

        {remaining.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle className="h-10 w-10 text-primary" />
            <p className="text-sm text-muted-foreground">
              {linkedCount > 0
                ? `Uspješno uvezano ${linkedCount} kartica.`
                : "Nema preostalih predloga."}
            </p>
            <Button variant="outline" onClick={handleClose}>Zatvori</Button>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px] pr-2">
            <div className="space-y-3">
              {remaining.map(({ card, suggestedSource }) => (
                <div
                  key={card.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3 bg-card"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" title={card.question.replace(/<[^>]*>/g, "")}>
                      {card.question.replace(/<[^>]*>/g, "").slice(0, 80)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Link2 className="h-3 w-3" />
                      {suggestedSource.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleLink(card.id, suggestedSource.id)}
                      className="text-xs h-7 px-2.5"
                    >
                      Uveži
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDismiss(card.id)}
                      className="text-xs h-7 px-2 text-muted-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {remaining.length > 0 && (
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-xs text-muted-foreground">
              {remaining.length} preostalih predloga
            </span>
            <Button variant="outline" size="sm" onClick={handleClose}>
              Zatvori
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
