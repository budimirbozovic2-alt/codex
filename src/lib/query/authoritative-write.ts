/**
 * Shared generation-guard helpers for authoritative SQLite → TanStack writes.
 */

export interface AuthoritativeWriteSession {
  readonly generation: number;
  committed: boolean;
}

export function startAuthoritativeWrite(begin: () => number): AuthoritativeWriteSession {
  return { generation: begin(), committed: false };
}

export async function finalizeAuthoritativeWrite(
  session: AuthoritativeWriteSession,
  commit: (gen: number) => Promise<number | boolean>,
  abort: () => Promise<number | boolean>,
): Promise<number | boolean> {
  if (session.committed) return -1;
  const result = await commit(session.generation);
  if (result === false || (typeof result === "number" && result < 0)) {
    await abort();
    throw new Error("Authoritative write commit failed (stale generation)");
  }
  session.committed = true;
  return result;
}

export async function abortAuthoritativeWrite(
  session: AuthoritativeWriteSession,
  abort: () => Promise<number | boolean>,
): Promise<void> {
  if (!session.committed) {
    await abort();
  }
}

/**
 * begin → work(generation) → commit(generation). On any thrown error, aborts
 * unless commit already succeeded.
 */
export async function runAuthoritativeWrite<T>(
  begin: () => number,
  commit: (gen: number) => Promise<number | boolean>,
  abort: () => Promise<number | boolean>,
  work: (generation: number) => Promise<T>,
): Promise<T> {
  const session = startAuthoritativeWrite(begin);
  try {
    const result = await work(session.generation);
    await finalizeAuthoritativeWrite(session, commit, abort);
    return result;
  } catch (err) {
    await abortAuthoritativeWrite(session, abort);
    throw err;
  }
}
