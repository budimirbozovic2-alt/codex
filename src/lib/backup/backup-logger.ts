/**
 * Standardized logger for the backup subsystem.
 *
 * Every error/success/start event in `src/lib/backup/*` flows through this
 * thin wrapper so the call site, scope (import/export/migrate/worker) and
 * lifecycle event (start/success/warn/error) appear in a uniform format:
 *
 *   [backup:<scope>:<event>] <message>
 *
 * Behavior is inherited from `@/lib/logger`:
 *   - start/success/warn → no-op in production (esbuild + logger guard)
 *   - error              → always surfaces (feeds crash log + DevTools)
 *
 * Callers should prefer this module over raw `console.*` or `logger.*`
 * inside the backup layer so future routing (telemetry, toast hooks,
 * structured log sinks) only has to land in one place.
 */
import { logger } from "@/lib/logger";

export type BackupScope = "import" | "export" | "migrate" | "worker";

type Meta = Record<string, unknown> | unknown[] | string | number | boolean | null | undefined;

function fmt(scope: BackupScope, event: string, msg: string): string {
  return `[backup:${scope}:${event}] ${msg}`;
}

function emitMeta(fn: (...a: readonly unknown[]) => void, line: string, meta?: Meta): void {
  if (meta === undefined) fn(line);
  else fn(line, meta);
}

export const backupLog = {
  start(scope: BackupScope, msg: string, meta?: Meta): void {
    emitMeta(logger.info, fmt(scope, "start", msg), meta);
  },
  success(scope: BackupScope, msg: string, meta?: Meta): void {
    emitMeta(logger.info, fmt(scope, "success", msg), meta);
  },
  warn(scope: BackupScope, msg: string, meta?: Meta): void {
    emitMeta(logger.warn, fmt(scope, "warn", msg), meta);
  },
  error(scope: BackupScope, msg: string, err?: unknown): void {
    // logger.error always executes — preserve the raw error object so
    // stack traces survive into the crash log.
    if (err === undefined) logger.error(fmt(scope, "error", msg));
    else logger.error(fmt(scope, "error", msg), err);
  },
} as const;

export type BackupLogger = typeof backupLog;
