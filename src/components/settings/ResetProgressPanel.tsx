import { useCallback, useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resetLearningProgress } from "@/lib/reset/reset-learning-progress";
import { logger } from "@/lib/logger";

export default function ResetProgressPanel() {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const handleReset = useCallback(async () => {
    setBusy(true);
    try {
      const report = await resetLearningProgress();
      setOpen(false);
      toast.success("Progres je resetovan", {
        description: `${report.cardsReset} kartica · ${report.sectionsReset} sekcija · historija obrisana`,
      });
    } catch (err) {
      logger.error("[reset-progress] failed", err);
      toast.error("Reset progresa nije uspio", {
        description: err instanceof Error ? err.message : "Neočekivana greška",
      });
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-destructive" />
          Resetuj učenje (zadrži sadržaj)
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Briše FSRS progres, review historiju, dnevnik, statistiku sesija i brojače
          čitanja. <strong className="text-foreground">Zadržava</strong> kartice, kategorije,
          izvore, mentalne mape, wiki članke i mnemonike (samo se brišu test statistike).
        </p>
      </div>

      <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
        <li>Sve sekcije kartica vraćaju u stanje „Novo”</li>
        <li>Review log, pomodoro, kalibracija, latencija, disciplina — prazno</li>
        <li>Planner dnevni brojači i redistribucija — reset</li>
        <li>FSRS podešavanja algoritma i struktura predmeta ostaju</li>
      </ul>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" size="sm" disabled={busy}>
            Resetuj progres učenja
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resetovati sav progres učenja?</DialogTitle>
            <DialogDescription className="space-y-2 pt-1">
              <span className="block">
                Ova radnja je nepovratna. Sadržaj kartica, wiki, mapa uma i struktura
                predmeta ostaju netaknuti, ali ćete početi kao novi korisnik u smislu
                ponavljanja i statistike.
              </span>
              <span className="block text-foreground font-medium">
                Preporuka: napravite backup prije resetovanja.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Odustani
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => { void handleReset(); }}
            >
              {busy ? "Resetujem…" : "Da, resetuj progres"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
