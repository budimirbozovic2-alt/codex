import { describe, expect, it } from "vitest";
import {
  categoryFreshness,
  mergeCategoriesByStrategy,
} from "@/lib/backup/merge-categories";
import type { CategoryRecord } from "@/lib/db-types";

function cat(
  id: string,
  name: string,
  subCount: number,
  profileUpdatedAt?: number,
): CategoryRecord {
  const subcategories = Array.from({ length: subCount }, (_, i) => ({
    id: `${id}-sub-${i}`,
    name: `Sub ${i}`,
    sortOrder: i,
    chapters: [{ id: `${id}-ch-${i}`, name: "Poglavlje", sortOrder: 0 }],
  }));
  return {
    id,
    name,
    sortOrder: 0,
    subcategories,
    examinerProfile: profileUpdatedAt ? { updatedAt: profileUpdatedAt } : undefined,
  };
}

describe("mergeCategoriesByStrategy", () => {
  it("keep skips categories that already exist by id", () => {
    const existing = [cat("cat-a", "Krivično", 1)];
    const imported = [cat("cat-a", "Krivično", 3), cat("cat-b", "Građansko", 1)];
    const { toUpsert, working } = mergeCategoriesByStrategy(imported, existing, "keep");
    expect(toUpsert.map((c) => c.id)).toEqual(["cat-b"]);
    expect(working.map((c) => c.id).sort()).toEqual(["cat-a", "cat-b"]);
    expect(working.find((c) => c.id === "cat-a")?.subcategories).toHaveLength(1);
  });

  it("newer upserts when imported taxonomy is richer (same name, different id)", () => {
    const existing = [cat("local-a", "Krivično", 1)];
    const imported = [cat("backup-a", "Krivično", 3)];
    const { toUpsert, working } = mergeCategoriesByStrategy(imported, existing, "newer");
    expect(toUpsert).toHaveLength(1);
    expect(toUpsert[0].id).toBe("local-a");
    expect(toUpsert[0].subcategories).toHaveLength(3);
    expect(working.find((c) => c.id === "local-a")?.subcategories).toHaveLength(3);
  });

  it("newer keeps existing when it is richer", () => {
    const existing = [cat("cat-a", "Krivično", 4)];
    const imported = [cat("cat-a", "Krivično", 1)];
    const { toUpsert } = mergeCategoriesByStrategy(imported, existing, "newer");
    expect(toUpsert).toHaveLength(0);
  });

  it("categoryFreshness weights taxonomy size", () => {
    expect(categoryFreshness(cat("a", "A", 2))).toBeGreaterThan(
      categoryFreshness(cat("b", "B", 1)),
    );
  });
});
