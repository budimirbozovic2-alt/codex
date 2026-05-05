import { Loader2, CheckCircle2, Brain } from "lucide-react";
import { useSessionContext } from "@/contexts/SessionContext";
import { useState, useEffect } from "react";

export default function ProcessingOverlay() {
  const { isProcessing } = useSessionContext();
  const [phase, setPhase] = useState<"analyzing" | "done">("analyzing");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isProcessing) {
      setVisible(true);
      setPhase("analyzing");
      const timer = setTimeout(() => setPhase("done"), 800);
      return () => clearTimeout(timer);
    } else {
      // fade out
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isProcessing]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-overlay flex items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity duration-300 ${
        isProcessing ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div
        className={`rounded-2xl bg-card border shadow-xl p-8 max-w-sm mx-4 text-center space-y-4 transition-all duration-300 ${
          isProcessing ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        {phase === "analyzing" ? (
          <>
            <div className="relative mx-auto w-16 h-16">
              <Brain className="h-8 w-8 text-primary absolute inset-0 m-auto" />
              <Loader2 className="h-16 w-16 text-primary/30 animate-spin absolute inset-0" />
            </div>
            <div>
              <p className="text-lg font-medium">Analiziram podatke...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Ažuriranje statistika, krive zaborava i interferencije
              </p>
            </div>
            <div className="flex justify-center gap-1.5">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-primary animate-pulse"
                  style={{ animationDelay: `${i * 200}ms` }}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="animate-in zoom-in duration-300">
              <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
            </div>
            <p className="text-lg font-medium">Analiza završena</p>
            <p className="text-sm text-muted-foreground">Grafikoni i statistike su ažurirane.</p>
          </>
        )}
      </div>
    </div>
  );
}
