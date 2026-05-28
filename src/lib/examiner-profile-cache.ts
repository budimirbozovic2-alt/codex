// Synchronous, in-memory examiner-profile cache keyed by categoryId.
// Primed from AppContext.categoryRecords on load and on every mutation,
// so callers in the SRS hot-path (calculateNextReview / reviewSection)
// can read it without async/await and without an "undefined first call".
//
// Invalidation strategy:
//   * `primeExaminerProfilesFromRecords` is authoritative — it reconciles
//     the cache with the SSOT (`categoryRecords`) and EVICTS entries for
//     categories no longer present. This prevents stale profiles from
//     surviving deletions or in-session subject switches.
//   * `invalidateExaminerProfile` is the explicit single-entry escape hatch.

import type { ExaminerProfile } from "./db-types";

const _cache = new Map<string, ExaminerProfile | undefined>();

/** Synchronously set the profile for a category. */
export function primeExaminerProfile(
  categoryId: string,
  profile: ExaminerProfile | undefined,
): void {
  _cache.set(categoryId, profile);
}

/**
 * Bulk prime — call once per `categoryRecords` change.
 *
 * Performs a full reconciliation:
 *   1. For every category in `records`, writes its profile into the cache.
 *      If `examinerProfile` is `undefined` on the record, the cache entry is
 *      OVERWRITTEN with `undefined` rather than left at its prior value.
 *      This guarantees a freshly-primed but profile-less category can never
 *      return a stale profile from a previous prime cycle.
 *   2. Evicts every cache entry whose categoryId is NOT in `records`
 *      (cache eviction for deleted subjects).
 */
export function primeExaminerProfilesFromRecords(
  records: Array<{ id: string; examinerProfile?: ExaminerProfile }>,
): void {
  const liveIds = new Set<string>();
  for (const r of records) {
    liveIds.add(r.id);
    _cache.set(r.id, r.examinerProfile);
  }
  for (const id of _cache.keys()) {
    if (!liveIds.has(id)) _cache.delete(id);
  }
}

/** Synchronous read — returns `undefined` for both "never primed" AND
 *  "primed but record has no examinerProfile". Use `hasExaminerProfileEntry`
 *  to disambiguate when needed. */
export function getExaminerProfileSync(
  categoryId: string,
): ExaminerProfile | undefined {
  return _cache.get(categoryId);
}

/** True iff the category has been reconciled into the cache, regardless of
 *  whether it actually has a profile attached. Lets callers distinguish
 *  "never primed" (false) from "primed, profile absent" (true). */
export function hasExaminerProfileEntry(categoryId: string): boolean {
  return _cache.has(categoryId);
}

/** Drop a single entry (used after an explicit category delete). */
export function invalidateExaminerProfile(categoryId: string): void {
  _cache.delete(categoryId);
}

/** Test helper. */
export function _clearExaminerProfileCache(): void {
  _cache.clear();
}
