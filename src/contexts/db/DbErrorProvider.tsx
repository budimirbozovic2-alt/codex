import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import { getDbErrorState, type DbErrorState } from "@/lib/db-schema";

const DbErrorContext = createContext<DbErrorState>(null);

export function useDbError(): DbErrorState {
  return useContext(DbErrorContext);
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
    // Pick up any error that landed between mount snapshot and subscribe
    const current = getDbErrorState();
    if (current !== error) setError(current);

    const unsub = eventBus.subscribe<DbErrorState>(EVENT_TYPES.DB_ERROR_CHANGED, (next) => {
      setError(next ?? null);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <DbErrorContext.Provider value={error}>{children}</DbErrorContext.Provider>;
}
