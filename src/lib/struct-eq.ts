/**
 * Structural equality helpers.
 *
 * `JSON.stringify` is the wrong tool for "did this change?" checks:
 *   - Allocates a full string per call, on hot paths (each render / each save).
 *   - Order-sensitive, so semantically equal sets register as different.
 *   - Silently breaks on `undefined`, functions, cycles, and number precision.
 *
 * These helpers replace it with intent-revealing, allocation-light comparisons.
 */

/** Order-insensitive equality for string lists treated as sets. */
export function sameStringSet(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean {
  const aLen = a?.length ?? 0;
  const bLen = b?.length ?? 0;
  if (aLen !== bLen) return false;
  if (aLen === 0) return true;
  const seen = new Set(a as readonly string[]);
  for (const x of b as readonly string[]) {
    if (!seen.has(x)) return false;
  }
  return true;
}

/** Order-sensitive equality for string lists. */
export function sameStringList(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean {
  const aLen = a?.length ?? 0;
  const bLen = b?.length ?? 0;
  if (aLen !== bLen) return false;
  if (aLen === 0) return true;
  for (let i = 0; i < aLen; i++) {
    if ((a as readonly string[])[i] !== (b as readonly string[])[i]) return false;
  }
  return true;
}

/**
 * Strict shallow equality across the union of own keys. Both objects are
 * compared key-by-key with `Object.is`. Returns false on first divergence.
 *
 * Suitable for "is this form dirty?" checks against settings objects whose
 * values are primitives or stable references.
 */
export function shallowEqual<T extends Record<string, unknown>>(a: T | null | undefined, b: T | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.is(a[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/** Like shallowEqual, but only inspects the explicitly listed keys. */
export function shallowEqualByKeys<T extends Record<string, unknown>>(a: T, b: T, keys: readonly (keyof T)[]): boolean {
  for (const k of keys) {
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}

/**
 * Compare two card source-module lists for *meaningful* equality. Modules are
 * keyed by their stable `id`; we compare length + per-id content fields. Used
 * to decide whether a coverage-cache invalidation is warranted.
 */
export interface SourceModuleLike {
  id: string;
  // Free-form; we compare via stable JSON of the inner shape minus id.
  // For our purposes we compare a small set of identifying fields.
  articleNum?: string | number | null;
  order?: number;
  text?: string;
  title?: string;
}

export function sameSourceModules(
  a: readonly SourceModuleLike[] | null | undefined,
  b: readonly SourceModuleLike[] | null | undefined,
): boolean {
  const aLen = a?.length ?? 0;
  const bLen = b?.length ?? 0;
  if (aLen !== bLen) return false;
  if (aLen === 0) return true;
  // Build map by id so order is irrelevant.
  const map = new Map<string, SourceModuleLike>();
  for (const m of a as readonly SourceModuleLike[]) map.set(m.id, m);
  for (const m of b as readonly SourceModuleLike[]) {
    const prev = map.get(m.id);
    if (!prev) return false;
    if (prev.articleNum !== m.articleNum) return false;
    if (prev.order !== m.order) return false;
    if (prev.text !== m.text) return false;
    if (prev.title !== m.title) return false;
  }
  return true;
}
