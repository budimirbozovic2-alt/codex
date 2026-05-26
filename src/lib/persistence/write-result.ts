/**
 * Unified write result type — PR-7d M2.4.
 *
 * Standardised shape for repository write operations so that the upcoming
 * TanStack Query `useMutation` integration can wrap any domain write with
 * the same `onSuccess` / `onError` semantics.
 *
 * Sync writes wrap their return in `Promise.resolve(...)` via `wrapWrite`;
 * async writes return a `Promise<WriteResult>` directly.
 */
export type WriteResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: WriteError };

export interface WriteError {
  code: WriteErrorCode;
  message: string;
  cause?: unknown;
}

export type WriteErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "QUOTA_EXCEEDED"
  | "PERSIST_FAILED"
  | "UNKNOWN";

export function ok<T>(value: T): WriteResult<T> {
  return { ok: true, value };
}

export function err(code: WriteErrorCode, message: string, cause?: unknown): WriteResult<never> {
  return { ok: false, error: { code, message, cause } };
}

/**
 * Wrap a sync-or-throwing operation into a `Promise<WriteResult<T>>`.
 * Used to bridge the current synchronous optimistic-commit repositories
 * into the standardised async mutation shape without touching call-sites.
 */
export async function wrapWrite<T>(fn: () => T | Promise<T>): Promise<WriteResult<T>> {
  try {
    const value = await fn();
    return ok(value);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === "QUOTA_EXCEEDED") return err("QUOTA_EXCEEDED", message, e);
    return err("PERSIST_FAILED", message, e);
  }
}
