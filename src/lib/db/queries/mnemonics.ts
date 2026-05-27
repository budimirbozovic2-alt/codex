/**
 * Mnemonics repository — PR-9 A1b P1.3.
 *
 * SQLite-primary read/write for the `mnemonics` table. Mirrors the pattern
 * established by `sources.ts` / `mind-maps.ts`:
 *   1. Try SQLite (when running in Electron).
 *   2. Mirror write to Dexie for one soak release.
 *   3. Fall back to Dexie-only in Vite dev preview (no Electron shell).
 *
 * Listeners (`subscribeMnemonics`) stay in
 * `features/mnemonic/mnemonic-storage/cards-repo.ts` — this module only
 * exposes the data plane.
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { MnemonicCard } from "@/features/mnemonic/mnemonic-storage";
import { notifyExecutorNull } from "./_shared/executor-telemetry";

// ─── Executor accessor ──────────────────────────────────────────────────

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) { notifyExecutorNull("mnemonics", "non-electron"); return null; }
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[mnemonics-repo] sqlite executor unavailable, using Dexie fallback", err);
    notifyExecutorNull("mnemonics", "error");
    return null;
  }
}

// ─── Codec ──────────────────────────────────────────────────────────────

function decodeMnemonic(row: { payload: string }): MnemonicCard | null {
  try { return JSON.parse(row.payload) as MnemonicCard; }
  catch (err) {
    logger.warn("[mnemonics-repo] decode failed", err);
    return null;
  }
}

const INSERT_SQL = `
  INSERT OR REPLACE INTO mnemonics
    (id, categoryId, subcategoryId, mnemonicStatus, hookType, createdAt, payload)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

function bindMnemonic(m: MnemonicCard): (string | number | null)[] {
  return [
    m.id,
    m.categoryId,
    m.subcategoryId ?? null,
    m.mnemonicStatus ?? null,
    m.hookType ?? null,
    m.createdAt,
    JSON.stringify(m),
  ];
}

// ─── Read API ───────────────────────────────────────────────────────────

export async function getMnemonic(id: string): Promise<MnemonicCard | undefined> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM mnemonics WHERE id = ? LIMIT 1", [id],
      );
      if (rows.length > 0) {
        const decoded = decodeMnemonic(rows[0]);
        if (decoded) return decoded;
      }
    } catch (err) {
      logger.warn("[mnemonics-repo] sqlite get failed", { id, err });
    }
  }
  try { return await db.mnemonics.get(id); }
  catch (err) {
    logger.warn("[mnemonics-repo] dexie get failed", { id, err });
    return undefined;
  }
}

export async function listAllMnemonics(): Promise<MnemonicCard[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>("SELECT payload FROM mnemonics");
      const decoded = rows.map(decodeMnemonic).filter((d): d is MnemonicCard => d !== null);
      if (decoded.length > 0) return decoded;
    } catch (err) {
      logger.warn("[mnemonics-repo] sqlite listAll failed", err);
    }
  }
  try { return await db.mnemonics.toArray(); }
  catch (err) {
    logger.warn("[mnemonics-repo] dexie listAll failed", err);
    return [];
  }
}

export async function listMnemonicsByCategory(categoryId: string): Promise<MnemonicCard[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM mnemonics WHERE categoryId = ?", [categoryId],
      );
      return rows.map(decodeMnemonic).filter((d): d is MnemonicCard => d !== null);
    } catch (err) {
      logger.warn("[mnemonics-repo] sqlite listByCategory failed", { categoryId, err });
    }
  }
  try { return await db.mnemonics.where("categoryId").equals(categoryId).toArray(); }
  catch (err) {
    logger.warn("[mnemonics-repo] dexie listByCategory failed", { categoryId, err });
    return [];
  }
}

// ─── Write API ──────────────────────────────────────────────────────────

export async function putMnemonic(card: MnemonicCard): Promise<void> {
  const exec = await tryGetExecutor();
  if (exec) {
    try { await exec.run(INSERT_SQL, bindMnemonic(card)); }
    catch (err) {
      logger.warn("[mnemonics-repo] sqlite put failed", { id: card.id, err });
      throw err;
    }
  }
  try { await db.mnemonics.put(card); }
  catch (err) {
    logger.warn("[mnemonics-repo] dexie mirror put failed", { id: card.id, err });
    throw err;
  }
}

export async function bulkPutMnemonics(cards: MnemonicCard[]): Promise<void> {
  if (cards.length === 0) return;
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      await exec.transaction(async (tx) => {
        for (const c of cards) {
          await tx.run(INSERT_SQL, bindMnemonic(c));
        }
      });
    } catch (err) {
      logger.warn("[mnemonics-repo] sqlite bulkPut failed", err);
      throw err;
    }
  }
  try { await db.mnemonics.bulkPut(cards); }
  catch (err) {
    logger.warn("[mnemonics-repo] dexie mirror bulkPut failed", err);
    throw err;
  }
}

export async function deleteMnemonic(id: string): Promise<void> {
  const exec = await tryGetExecutor();
  if (exec) {
    try { await exec.run("DELETE FROM mnemonics WHERE id = ?", [id]); }
    catch (err) {
      logger.warn("[mnemonics-repo] sqlite delete failed", { id, err });
    }
  }
  try { await db.mnemonics.delete(id); }
  catch (err) {
    logger.warn("[mnemonics-repo] dexie delete failed", { id, err });
    throw err;
  }
}

// ── A2 — Dexie mirror helper for category-deletion cascade ──────────────
export async function deleteMnemonicsByCategoryDexie(categoryId: string): Promise<number> {
  try {
    return await db.mnemonics.where("categoryId").equals(categoryId).delete();
  } catch (err) {
    logger.warn("[mnemonics-repo] dexie deleteByCategory failed", { categoryId, err });
    return 0;
  }
}
