import { useSyncExternalStore } from "react";
import {
  getSqliteReadyState,
  subscribeSqliteReady,
  type SqliteReadyState,
} from "@/lib/persistence/sqlite/readyMachine";

/**
 * O-1: React bridge nad sqliteReadyMachine. Komponente mogu
 * gate-ovati render na ready/degraded/fatal bez vlastitog
 * "did the executor load?" trackinga.
 */
export function useSqliteReady(): SqliteReadyState {
  return useSyncExternalStore(
    subscribeSqliteReady,
    getSqliteReadyState,
    getSqliteReadyState,
  );
}
