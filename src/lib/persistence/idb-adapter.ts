/**
 * IDB adapter — PR-9 M4 (post A1a).
 *
 * Simple Dexie `bulkApply` wrapper. The outbox WAL table that previously
 * provided crash recovery for IDB writes was dropped — SQLite WAL is now
 * the durable SSOT, and the IDB mirror is best-effort rollback insurance.
 */
import type { Card } from "@/lib/spaced-repetition";
import { idbBulkApply } from "@/lib/db";
import type { PersistAdapter } from "./PersistAdapter";

async function bulkApply(puts: readonly Card[], deletes: readonly string[]): Promise<void> {
  await idbBulkApply(puts as Card[], deletes as string[]);
}

export const idbAdapter: PersistAdapter = { bulkApply };
