import { useEffect, useState } from "react";
import { AlertTriangle, Zap } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  countEssaySatellites,
  SATELLITE_OVERLOAD_THRESHOLD,
} from "@/lib/saga/saga-attach";
import type { Card } from "@/lib/spaced-repetition";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  essay: Card;
  allCards: Card[];
  selectedText: string;
  onConfirm: (question: string, answer: string) => void;
}

export function CreateSatelliteDialog({
  open,
  onOpenChange,
  essay,
  allCards,
  selectedText,
  onConfirm,
}: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    if (!open) return;
    const trimmed = selectedText.trim();
    setQuestion(trimmed);
    setAnswer(trimmed);
  }, [open, selectedText]);

  const currentSatellites = countEssaySatellites(allCards, essay.id);
  const afterAttach = currentSatellites + 1;
  const isOverloaded = afterAttach > SATELLITE_OVERLOAD_THRESHOLD;

  const handleConfirm = () => {
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a) return;
    onConfirm(q, a);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Kreiraj blic satelit
          </DialogTitle>
          <DialogDescription>
            Izdvojeno iz pasivnog čitanja — mikro-pitanje vezano za esej (SuperMemo extract).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sat-question">Pitanje (blic)</Label>
            <Input
              id="sat-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Šta treba znati iz ovog bloka?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sat-answer">Odgovor</Label>
            <Textarea
              id="sat-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={4}
              placeholder="Kratki odgovor za recall"
            />
          </div>

          {isOverloaded && (
            <p className="flex items-start gap-2 text-xs text-warning rounded-md border border-warning/30 bg-warning/10 p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Esej već ima {currentSatellites} blicova (preporuka ≤ {SATELLITE_OVERLOAD_THRESHOLD}).
              Nastavak može opteretiti sagę.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Odustani
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!question.trim() || !answer.trim()}>
            Kreiraj satelit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
