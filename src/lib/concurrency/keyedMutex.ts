/**
 * Keyed mutex — serijalizuje async operacije po ključu (FIFO order),
 * sa izolacijom grešaka (jedan failure ne kvari ostatak lanca).
 *
 * Zamjena za ad-hoc `let _pending: Promise<void> = Promise.resolve()` obrasce
 * koje smo imali u više modula (`categoryRepository`, `planner/cache`).
 *
 * API:
 *   const m = createKeyedMutex();
 *   await m.runExclusive("save", async () => { ... });    // čeka prethodne pod istim ključem
 *   await m.runExclusive(null, async () => { ... });      // globalni (jedan lanac za sve null pozive)
 *   m.pending("save");   // koliko poslova čeka pod ključem
 *   await m.drain();     // sačekaj sve aktivne lance
 */
import { logger } from "@/lib/logger";

type Key = string | number | symbol | null;

interface KeyedMutex {
  runExclusive<T>(key: Key, op: () => Promise<T>, label?: string): Promise<T>;
  pending(key?: Key): number;
  drain(key?: Key): Promise<void>;
}

const GLOBAL: Key = Symbol.for("keyedMutex.global");

export function createKeyedMutex(): KeyedMutex {
  const chains = new Map<Key, Promise<unknown>>();
  const counts = new Map<Key, number>();

  function keyOf(k: Key): Key {
    return k ?? GLOBAL;
  }

  function bump(k: Key, delta: number) {
    const cur = counts.get(k) ?? 0;
    const next = cur + delta;
    if (next <= 0) counts.delete(k);
    else counts.set(k, next);
  }

  function runExclusive<T>(key: Key, op: () => Promise<T>, label?: string): Promise<T> {
    const k = keyOf(key);
    const prev = chains.get(k) ?? Promise.resolve();
    bump(k, +1);

    const next = prev.then(() => op());

    // Zatruvana grana ide u chain (preserve order) ali ne propagira reject:
    const tail = next
      .catch((e: unknown) => {
        if (label) logger.warn(`[mutex:${label}]`, e);
      })
      .finally(() => {
        bump(k, -1);
        // GC: ako više nema poslova pod ovim ključem, oslobodi referencu.
        if ((counts.get(k) ?? 0) === 0 && chains.get(k) === tail) {
          chains.delete(k);
        }
      });

    chains.set(k, tail);
    return next; // caller dobija pravi rezultat (sa greškom ako op() padne)
  }

  function pending(key?: Key): number {
    if (key === undefined) {
      let total = 0;
      for (const v of counts.values()) total += v;
      return total;
    }
    return counts.get(keyOf(key)) ?? 0;
  }

  async function drain(key?: Key): Promise<void> {
    if (key === undefined) {
      while (chains.size > 0) {
        const snapshot = Array.from(chains.values());
        await Promise.allSettled(snapshot);
      }
      return;
    }
    const k = keyOf(key);
    while (chains.has(k)) {
      await chains.get(k)?.catch(() => {});
    }
  }

  return { runExclusive, pending, drain };
}
