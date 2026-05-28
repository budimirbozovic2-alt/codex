/**
 * PR-7b · Pre-flight telemetry for the v22 destructive upgrade.
 *
 * Run BEFORE `db.open()` on every boot. Three outcomes:
 *  1. Not in Electron → skip (set `v4_skip_reason: "no_electron"`). App
 *     remains usable; v22 destructive upgrade hook will detect missing
 *     `v4_telemetry_healthy` flag and bail.
 *  2. Migration ratio < 100% → skip; let lazy-migrate keep backfilling.
 *  3. 100% migrated + forced backup succeeds → set `v4_telemetry_healthy=true`
 *     which unlocks the v22 upgrade hook.
 *
 * The forced backup uses the existing `streamBackup` + Electron stream IPC
 * (`backupStreamStart/Chunk/Finish`) — no new file format introduced.
 */
import { db } from "@/lib/db";
import { streamBackup, tableSpec } from "@/lib/backup/export-stream";
import { logger } from "@/lib/logger";
import {
  listAllCards,
  listAllSources,
  // `bulkPutArticles` export is for KB; we just need read for ratio.
} from "@/lib/db/queries";
import { listAllArticles } from "@/lib/db/queries/knowledge-base";
import type { Table } from "dexie";

const FLAG_HEALTHY = "v4_telemetry_healthy";
const FLAG_SKIP_REASON = "v4_skip_reason";
const FLAG_BACKUP_PATH = "v4_backup_path";
const TIMEOUT_MS = 5000;

export type PreflightResult = {
  healthy: boolean;
  reason?: "no_electron" | "lazy_migration_incomplete" | "backup_failed" | "timeout" | "exception";
  ratio?: number;
};

function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI?.backupStreamStart;
}

async function streamToElectron(blob: Blob): Promise<boolean> {
  if (!window.electronAPI?.backupStreamStart) return false;
  const started = await window.electronAPI.backupStreamStart();
  if (!started) return false;
  const CHUNK = 1024 * 1024;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.slice(i, i + CHUNK);
    const ok = await window.electronAPI.backupStreamChunk(chunk);
    if (!ok) {
      try { await window.electronAPI.backupStreamAbort?.(); } catch { /* noop */ }
      return false;
    }
  }
  const finished = await window.electronAPI.backupStreamFinish();
  if (finished) {
    localStorage.setItem(FLAG_BACKUP_PATH, `electron-default-${Date.now()}`);
  }
  return !!finished;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return await Promise.race([
    p,
    new Promise<"timeout">(resolve => setTimeout(() => resolve("timeout"), ms)),
  ]);
}

async function computeMigrationRatio(): Promise<number> {
  const [cards, sources, articles] = await Promise.all([
    db.cards.toArray(),
    db.sources.toArray(),
    db.knowledgeBaseArticles.toArray(),
  ]);
  let total = 0;
  let ok = 0;
  for (const c of cards) {
    for (const s of c.sections ?? []) {
      total++;
      if (s.contentDoc?.version === 4 && s.contentDoc.content) ok++;
    }
  }
  for (const src of sources) {
    total++;
    if (src.contentDoc?.version === 4) ok++;
  }
  for (const a of articles) {
    total++;
    if (a.contentDoc?.version === 4) ok++;
  }
  return total === 0 ? 1.0 : ok / total;
}

export async function runV4Preflight(): Promise<PreflightResult> {
  try {
    if (!isElectron()) {
      localStorage.removeItem(FLAG_HEALTHY);
      localStorage.setItem(FLAG_SKIP_REASON, "no_electron");
      return { healthy: false, reason: "no_electron" };
    }

    const ratio = await withTimeout(computeMigrationRatio(), TIMEOUT_MS);
    if (ratio === "timeout") {
      localStorage.removeItem(FLAG_HEALTHY);
      localStorage.setItem(FLAG_SKIP_REASON, "timeout");
      return { healthy: false, reason: "timeout" };
    }
    if (ratio < 1.0) {
      localStorage.removeItem(FLAG_HEALTHY);
      localStorage.setItem(FLAG_SKIP_REASON, "lazy_migration_incomplete");
      logger.warn(`[preflight] lazy migration incomplete (${(ratio * 100).toFixed(1)}%) — skipping v22 cleanup`);
      return { healthy: false, reason: "lazy_migration_incomplete", ratio };
    }

    // Stream a forced full backup before unlocking the destructive upgrade.
    const blob = await streamBackup({
      version: 7,
      type: "full",
      scalars: { preflight: true, ts: Date.now() },
      tables: [
        tableSpec("cards", db.cards),
        tableSpec("sources", db.sources),
        tableSpec("knowledgeBaseArticles", db.knowledgeBaseArticles),
        tableSpec("categories", db.categories),
      ],
      txTables: [
        db.cards, db.sources, db.knowledgeBaseArticles, db.categories,
      ] as unknown as Table<unknown, unknown>[],
      onProgress: () => { /* silent */ },
      pStart: 0,
      pEnd: 100,
    });

    const ok = await streamToElectron(blob);
    if (!ok) {
      localStorage.removeItem(FLAG_HEALTHY);
      localStorage.setItem(FLAG_SKIP_REASON, "backup_failed");
      return { healthy: false, reason: "backup_failed" };
    }

    localStorage.setItem(FLAG_HEALTHY, "true");
    localStorage.removeItem(FLAG_SKIP_REASON);
    logger.log("[preflight] v4 healthy — pre-migration backup saved, v22 cleanup unlocked");
    return { healthy: true, ratio: 1.0 };
  } catch (err) {
    logger.error("[preflight] exception", err);
    localStorage.removeItem(FLAG_HEALTHY);
    localStorage.setItem(FLAG_SKIP_REASON, "exception");
    return { healthy: false, reason: "exception" };
  }
}

export function isV4TelemetryHealthy(): boolean {
  try { return localStorage.getItem(FLAG_HEALTHY) === "true"; } catch { return false; }
}
