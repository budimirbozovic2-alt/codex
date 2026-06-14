/**
 * Promise-chain mutex for serializing async work on the renderer thread.
 * Used by worker-client.ts so all non-transaction RPCs are strictly ordered.
 */
let lock = Promise.resolve();

export async function withSerialLock<T>(fn: () => Promise<T>): Promise<T> {
  const previousLock = lock;
  let releaseLock!: () => void;
  lock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  await previousLock;
  try {
    return await fn();
  } finally {
    releaseLock();
  }
}

/** Test-only reset — restores idle lock state between vitest cases. */
export function __resetSerialLockForTests(): void {
  lock = Promise.resolve();
}
