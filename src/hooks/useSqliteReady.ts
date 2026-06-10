import { useSyncExternalStore } from "react";
import {
  getSqliteReadyState,
  subscribeSqliteReady,
  type SqliteReadyState,
} from "@/lib/persistence/sqlite/readyMachine";

/**
 * Reactive bridge nad modul-level sqliteReadyMachine signalom.
 * UI gate-ovi mogu čekati `ready` / prikazati degraded banner bez
 * indirekcije kroz React Query.
 */
export function useSqliteReady(): SqliteReadyState {
  return useSyncExternalStore(
    subscribeSqliteReady,
    getSqliteReadyState,
    getSqliteReadyState
  );
}
