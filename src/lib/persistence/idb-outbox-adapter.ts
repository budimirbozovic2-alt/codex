/**
 * IDB + outbox-table implementation of `PersistAdapter` — PR-7d M3.2.
 *
 * Behavior preserved verbatim from the prior inline implementation in
 * `persist-queue.ts`:
 *   • `bulkApply` runs `idbBulkApply` + `outbox.bulkDelete` inside ONE rw
 *     transaction over `cards + outbox`. A crash after commit leaves no
 *     outbox row → no re-apply. A crash before commit leaves the row →
 *     `recoverPending()` re-applies on boot.
 *   • `enqueueWal` is fire-and-forget: outbox writes are best-effort crash
 *     insurance, not a blocker for the optimistic in-memory commit.
 *   • `recoverPending` is idempotent — last-write-wins per cardId guarantees
 *     we never resurrect older state.
 */
import type { Card } from "@/lib/spaced-repetition";
import { idbBulkApply } from "@/lib/db";
import { db } from "@/lib/db-schema";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import type { PersistAdapter, WalOp } from "./PersistAdapter";

async function bulkApply(puts: readonly Card[], deletes: readonly string[]): Promise<void> {
  await db.transaction("rw", db.cards, db.outbox, async () => {
    await idbBulkApply(puts as Card[], deletes as string[]);
    const clearIds = [...puts.map((c) => c.id), ...deletes];
    if (clearIds.length > 0) await db.outbox.bulkDelete(clearIds);
  });
}

async function enqueueWal(op: WalOp): Promise<void> {
  try {
    if (op.kind === "put") {
      await db.outbox.put({ cardId: op.card.id, op: "put", card: op.card, ts: Date.now() });
    } else {
      await db.outbox.put({ cardId: op.id, op: "delete", ts: Date.now() });
    }
  } catch (err) {
    logger.warn("[idbOutboxAdapter] enqueueWal failed", err);
  }
}

async function recoverPending(): Promise<{ recovered: number }> {
  let rows;
  try {
    rows = await db.outbox.toArray();
  } catch (err) {
    logger.warn("[idbOutboxAdapter] outbox scan failed", err);
    return { recovered: 0 };
  }
  if (rows.length === 0) return { recovered: 0 };

  const puts: Card[] = [];
  const deletes: string[] = [];
  for (const row of rows) {
    if (row.op === "put" && row.card) puts.push(row.card);
    else if (row.op === "delete") deletes.push(row.cardId);
  }

  try {
    await db.transaction("rw", db.cards, db.outbox, async () => {
      await idbBulkApply(puts, deletes);
      await db.outbox.bulkDelete(rows.map((r) => r.cardId));
    });
    logger.info(`[idbOutboxAdapter] recovered ${rows.length} pending writes from outbox`);
    return { recovered: rows.length };
  } catch (err) {
    logger.error("[idbOutboxAdapter] outbox recovery failed", err);
    toast.error("Oporavak nedovršenih izmjena nije uspio. Izvezite backup prije nastavka.");
    return { recovered: 0 };
  }
}

export const idbOutboxAdapter: PersistAdapter = {
  bulkApply,
  enqueueWal,
  recoverPending,
};
