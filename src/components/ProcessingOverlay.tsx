import { Loader2, CheckCircle2, Brain } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { useSessionContext } from "@/contexts/SessionContext";
import { useState, useEffect } from "react";
export default function ProcessingOverlay() {
  const { isProcessing } = useSessionContext();
  const [phase, setPhase] = useState<"analyzing" | "done">("analyzing");

  useEffect(() => {
    if (isProcessing) {
      setPhase("analyzing");
      const timer = setTimeout(() => setPhase("done"), 1800);
      return () => clearTimeout(timer);
    }
  }, [isProcessing]);

  return (
    <AnimatePresence>
      {isProcessing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="rounded-2xl bg-card border shadow-xl p-8 max-w-sm mx-4 text-center space-y-4"
          >
            {phase === "analyzing" ? (
              <>
                <div className="relative mx-auto w-16 h-16">
                  <Brain className="h-8 w-8 text-primary absolute inset-0 m-auto" />
                  <Loader2 className="h-16 w-16 text-primary/30 animate-spin absolute inset-0" />
                </div>
                <div>
                  <p className="text-lg font-serif">Analiziram podatke...</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ažuriranje statistika, krive zaborava i interferencije
                  </p>
                </div>
                {/* Animated dots */}
                <div className="flex justify-center gap-1.5">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 rounded-full bg-primary"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                >
                  <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
                </motion.div>
                <p className="text-lg font-serif">Analiza završena</p>
                <p className="text-sm text-muted-foreground">Grafikoni i statistike su ažurirane.</p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
