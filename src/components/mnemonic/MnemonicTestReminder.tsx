import { ArrowLeft, Timer, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface Props {
  recallLimit: number;
  queueLength: number;
  onBack: () => void;
  onStart: () => void;
}

export default function MnemonicTestReminder({ recallLimit, queueLength, onBack, onStart }: Props) {
  return (
    <div className="max-w-xl mx-auto space-y-8">
      <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Nazad
      </button>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-12 space-y-6">
        <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Zap className="h-10 w-10 text-primary" />
        </div>
        <h2 className="imperial-title">Aktiviraj mentalni okidač</h2>
        <div className="max-w-sm mx-auto space-y-3 text-sm text-muted-foreground">
          <p>Prije početka testiranja, pripremi se mentalno:</p>
          <div className="rounded-xl border bg-card p-4 text-left space-y-2">
            <p className="flex items-center gap-2"><span className="text-primary font-bold">1.</span> Zatvori oči na 3 sekunde</p>
            <p className="flex items-center gap-2"><span className="text-primary font-bold">2.</span> Vizualizuj svoju "mentalnu sobu"</p>
            <p className="flex items-center gap-2"><span className="text-primary font-bold">3.</span> Aktiviraj asocijativni film za svaku karticu</p>
          </div>
          <p className="text-xs">
            <Timer className="inline h-3 w-3 mr-1" />
            Imaš <strong className="text-foreground">{recallLimit} sekunde</strong> da prizoveš mentalnu kuku.
          </p>
          <p className="text-xs text-muted-foreground">Dril: {queueLength} kartica</p>
        </div>
        <Button onClick={onStart} size="lg" className="gap-2">
          <Zap className="h-4 w-4" /> Započni testiranje
        </Button>
      </motion.div>
    </div>
  );
}
