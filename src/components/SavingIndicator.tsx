import { useEffect } from "react";
import { usePersistingState } from "@/hooks/usePersistingState";
import { RefreshCw } from "lucide-react";

/**
 * Global indicator for TanStack Query pending mutations.
 * Rendered at app root; tracks card/source persistence across the app.
 */
export default function SavingIndicator() {
  const { hasPending: isSaving, pendingCount } = usePersistingState();

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSaving) {
        e.preventDefault();
        e.returnValue = "Podaci se još uvijek čuvaju. Da li ste sigurni da želite napustiti aplikaciju?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSaving]);

  if (!isSaving) return null;
  return (
    <div className="absolute bottom-4 right-4 z-[9999] flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/90 text-primary-foreground shadow-lg animate-fade-up">
      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      <span className="text-[11px] font-medium tracking-wide">
        {pendingCount > 10 ? `Spremanje (${pendingCount})...` : "Spremanje..."}
      </span>
    </div>
  );
}
