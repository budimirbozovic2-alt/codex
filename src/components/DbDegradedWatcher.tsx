/**
 * PR-H-OPFS-FIX UX safety net: listen for the `db-degraded` event emitted by
 * `src/lib/persistence/sqlite/client.ts` when the durable OPFS executor cannot
 * be obtained. Surfaces a sticky toast so the user knows changes will be lost
 * on restart — without it the renderer silently writes to an in-memory store.
 */
import { useEffect } from "react";
import { toast } from "sonner";

interface DbDegradedDetail {
  reason: "opfs-api-missing" | "opfs-runtime-error";
  diag?: unknown;
}

export function DbDegradedWatcher(): null {
  useEffect(() => {
    let fired = false;
    const handler = (event: Event) => {
      if (fired) return;
      fired = true;
      const detail = (event as CustomEvent<DbDegradedDetail>).detail;
      const reason = detail?.reason ?? "opfs-api-missing";
      toast.error("Trajno čuvanje nije dostupno", {
        description:
          "Promjene će biti izgubljene na restart. Restartujte aplikaciju ili kontaktirajte podršku.",
        duration: Infinity,
        id: `db-degraded-${reason}`,
      });
    };
    window.addEventListener("db-degraded", handler);
    return () => window.removeEventListener("db-degraded", handler);
  }, []);
  return null;
}
