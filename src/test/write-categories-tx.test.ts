import { describe, expect, it, vi } from "vitest";
import { writeCategoriesTx } from "@/lib/backup/write-categories-tx";
import type { CategoryRecord } from "@/lib/db-types";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";

function makeCategory(id: string, name: string): CategoryRecord {
  return {
    id,
    name,
    sortOrder: 0,
    subcategories: [{
      id: `${id}-sub`,
      name: "Podkategorija",
      sortOrder: 0,
      chapters: [{ id: `${id}-ch`, name: "Poglavlje", sortOrder: 0 }],
    }],
  };
}

describe("writeCategoriesTx", () => {
  it("persists taxonomy on overwrite import", async () => {
    const runs: string[] = [];
    const tx = {
      run: vi.fn(async (sql: string) => { runs.push(sql); }),
      runMany: vi.fn(async () => {}),
      all: vi.fn(async () => []),
      transaction: vi.fn(),
    };

    const parsed = {
      categories: [makeCategory("cat-1", "Matematika")],
    } as ParsedBackup;

    await writeCategoriesTx(tx, parsed, "overwrite", []);

    expect(runs).toContain("DELETE FROM chapters");
    expect(runs).toContain("DELETE FROM subcategories");
    expect(runs).toContain("DELETE FROM categories");
    expect(tx.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR REPLACE INTO subcategories"),
      expect.any(Array),
    );
    expect(tx.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR REPLACE INTO chapters"),
      expect.any(Array),
    );
  });

  it("persists taxonomy for newly inserted categories on keep import", async () => {
    const tx = {
      run: vi.fn(async () => {}),
      runMany: vi.fn(async () => {}),
      all: vi.fn(async () => []),
      transaction: vi.fn(),
    };

    const parsed = {
      categories: [makeCategory("cat-new", "Fizika")],
    } as ParsedBackup;

    const result = await writeCategoriesTx(tx, parsed, "keep", []);

    expect(result).toHaveLength(1);
    expect(tx.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR REPLACE INTO subcategories"),
      expect.any(Array),
    );
  });

  it("replaces taxonomy on newer import when backup is richer", async () => {
    const runs: string[] = [];
    const tx = {
      run: vi.fn(async (sql: string) => { runs.push(sql); }),
      runMany: vi.fn(async () => {}),
      all: vi.fn(async () => [{ id: "sub-old" }]),
      transaction: vi.fn(),
    };

    const existing = [makeCategory("cat-a", "Krivično")];
    const richer = {
      id: "cat-backup",
      name: "Krivično",
      sortOrder: 0,
      subcategories: [{
        id: "sub-new",
        name: "Novi dio",
        sortOrder: 0,
        chapters: [
          { id: "ch-1", name: "A", sortOrder: 0 },
          { id: "ch-2", name: "B", sortOrder: 1 },
        ],
      }],
    };

    const parsed = { categories: [richer] } as ParsedBackup;

    const result = await writeCategoriesTx(tx, parsed, "newer", existing);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("cat-a");
    expect(result[0].subcategories[0].chapters).toHaveLength(2);
    expect(runs).toContain("DELETE FROM chapters WHERE subcategoryId = ?");
    expect(runs).toContain("DELETE FROM subcategories WHERE categoryId = ?");
  });
});
