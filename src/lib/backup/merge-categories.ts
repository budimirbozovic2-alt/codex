/**
 * Pre-merge category records per import strategy (pure, mirrors cards merge).
 */
import type { CategoryRecord } from "@/lib/db-types";
import type { ImportStrategy } from "@/lib/backup/import-types";

export interface MergeCategoriesResult {
  /** Categories that need SQLite upsert + taxonomy write. */
  toUpsert: CategoryRecord[];
  /** Authoritative in-memory category list after merge. */
  working: CategoryRecord[];
}

/** Richness + profile timestamp — higher means "newer" for merge decisions. */
export function categoryFreshness(c: CategoryRecord): number {
  let score = c.examinerProfile?.updatedAt ?? 0;
  for (const sub of c.subcategories ?? []) {
    score += 1_000;
    score += (sub.chapters?.length ?? 0) * 100;
  }
  return score;
}

function resolveExistingId(
  imported: CategoryRecord,
  existingById: Map<string, CategoryRecord>,
  existingByName: Map<string, string>,
): string | undefined {
  if (existingById.has(imported.id)) return imported.id;
  return existingByName.get(imported.name.toLowerCase());
}

export function mergeCategoriesByStrategy(
  imported: readonly CategoryRecord[],
  existing: readonly CategoryRecord[],
  strategy: ImportStrategy,
): MergeCategoriesResult {
  if (strategy === "overwrite") {
    return {
      toUpsert: [...imported],
      working: [...imported],
    };
  }

  const workingById = new Map(existing.map((c) => [c.id, { ...c, subcategories: [...(c.subcategories ?? [])] }]));
  const existingById = new Map(existing.map((c) => [c.id, c]));
  const existingByName = new Map(existing.map((c) => [c.name.toLowerCase(), c.id]));
  const toUpsert: CategoryRecord[] = [];

  for (const ic of imported) {
    const existingId = resolveExistingId(ic, existingById, existingByName);

    if (!existingId) {
      workingById.set(ic.id, ic);
      toUpsert.push(ic);
      existingByName.set(ic.name.toLowerCase(), ic.id);
      existingById.set(ic.id, ic);
      continue;
    }

    if (strategy === "keep") {
      continue;
    }

    if (strategy === "newer") {
      const prev = workingById.get(existingId)!;
      const normalized: CategoryRecord = { ...ic, id: existingId };
      if (categoryFreshness(normalized) > categoryFreshness(prev)) {
        workingById.set(existingId, normalized);
        toUpsert.push(normalized);
      }
    }
  }

  return {
    toUpsert,
    working: [...workingById.values()].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
    ),
  };
}
