import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

interface Props {
  error: { type: "version" | "timeout"; message: string };
}

export default function DatabaseRecoveryPanel({ error }: Props) {
  const [confirming, setConfirming] = useState(false);

  const handleReset = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      const { db } = await import("@/lib/db");
      await db.delete();
    } catch (e) {
      console.error("[DatabaseRecovery] delete failed", e);
    }
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95">
      <div className="glass-card max-w-md w-full mx-4 p-8 space-y-6 text-center">
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-destructive/10">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl text-foreground">
            {error.type === "version" ? "Greška u verziji baze" : "Baza ne reaguje"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {error.type === "version"
              ? "Verzija baze podataka se ne poklapa sa trenutnom verzijom aplikacije. Ovo se obično dešava nakon ažuriranja."
              : "Baza podataka se nije otvorila u predviđenom roku. Moguće je da je zaključana ili oštećena."}
          </p>
          <p className="text-xs text-muted-foreground/60 font-mono mt-2">{error.message}</p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl border border-border bg-card hover:bg-secondary transition-colors text-foreground font-medium"
          >
            <RefreshCw className="h-4 w-4" />
            Pokušaj ponovo
          </button>

          <button
            onClick={handleReset}
            className={`flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl border transition-colors font-medium ${
              confirming
                ? "border-destructive bg-destructive text-destructive-foreground"
                : "border-destructive/30 text-destructive hover:bg-destructive/10"
            }`}
          >
            <Trash2 className="h-4 w-4" />
            {confirming ? "Potvrdi brisanje baze" : "Resetuj bazu"}
          </button>

          {confirming && (
            <p className="text-xs text-destructive">
              Ova akcija će obrisati sve podatke! Preporučujemo da prvo pokušate "Pokušaj ponovo".
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
