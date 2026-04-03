import { BookOpen } from "lucide-react";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
export default function ReviewComplete({ onBack }: { onBack: () => void }) {
  useEffect(() => {
    import("@/lib/sounds").then(m => m.playSessionComplete());
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-6 py-20">
      <div className="inline-flex p-4 rounded-2xl bg-gold/10 mb-2">
        <BookOpen className="h-10 w-10 text-gold" />
      </div>
      <h2 className="text-4xl font-bold">Sesija završena!</h2>
      <p className="text-muted-foreground text-lg">Sve dospjele sekcije su konsolidovane. Odlično!</p>
      <Button onClick={onBack} className="btn-imperial bg-primary hover:bg-primary/90 text-primary-foreground">
        <BookOpen className="h-4 w-4 mr-2" /> Zaključi i sačuvaj napredak
      </Button>
    </motion.div>
  );
}
