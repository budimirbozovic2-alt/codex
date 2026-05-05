import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { eventBus } from "@/lib/event-bus";
import { EVENT_TYPES } from "@/lib/event-bus-types";
import { getDbErrorState, type DbErrorState } from "@/lib/db-schema";

const DbErrorContext = createContext<DbErrorState>(null);

export function useDbError(): DbErrorState {
  return useContext(DbErrorContext);
}

/** M5: Shallow compare so identical error states don't trigger re-renders. */
function sameDbError(a: DbErrorState, b: DbErrorState): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.type === b.type && a.message === b.message;
}

/**
 * Reactive bridge over the module-level `dbErrorState` in db-schema.ts.
 *
 * The module-level variable remains the snapshot for early-boot async callers
 * (e.g., `useCardBootstrap` reads it before this provider mounts), but UI
 * subscribes here and is notified through the `DB_ERROR_CHANGED` event whenever
 * `setDbErrorState` is called.
 */
export function DbErrorProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<DbErrorState>(() => getDbErrorState());

  useEffect(() => {
    // Pick up any error that landed between mount snapshot and subscribe.
    setError((prev) => {
      const current = getDbErrorState();
      return sameDbError(prev, current) ? prev : current;
    });

    const unsub = eventBus.subscribe<DbErrorState>(EVENT_TYPES.DB_ERROR_CHANGED, (next) => {
      const incoming = next ?? null;
      // M5 + W4: functional updater + dedupe so cascaded DB_BLOCKED bursts
      // don't kick off downstream renders for every consumer of useDbError().
      setError((prev) => (sameDbError(prev, incoming) ? prev : incoming));
    });
    return unsub;
  }, []);

  return <DbErrorContext.Provider value={error}>{children}</DbErrorContext.Provider>;
}
