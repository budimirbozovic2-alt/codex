/**
 * Full import → reload read: taxonomy must survive in SQLite relational tables.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BackupSchema, type ParsedBackup } from "@/lib/migrations/backup-schema";
import type { CategoryRecord } from "@/lib/db-types";
import { getTestSqliteTable, resetTestSqliteState } from "./sqlite-harness";

vi.mock("@/lib/repositories", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories")>(
    "@/lib/repositories",
  );
  return {
    ...actual,
    categoryRepository: {
      ...actual.categoryRepository,
      replaceAll: vi.fn(),
    },
  };
});

import { applyImportAtomically } from "@/lib/backup/import-transaction";
import { readAllCategoriesForBackup } from "@/lib/db/queries";

function makeCategory(id: string, name: string): CategoryRecord {
  return {
    id,
    name,
    sortOrder: 0,
    subcategories: [{
      id: `${id}-sub`,
      name: "Opšti dio",
      sortOrder: 0,
      chapters: [
        { id: `${id}-ch-1`, name: "Uvod", sortOrder: 0 },
        { id: `${id}-ch-2`, name: "Osnovni pojmovi", sortOrder: 1 },
      ],
    }],
  };
}

function makeParsed(categories: CategoryRecord[]): ParsedBackup {
  return {
    version: 7,
    type: "full",
    cards: [],
    categories,
    sources: [],
    mindMaps: [],
    knowledgeBaseArticles: [],
    mnemonics: [],
    reviewLog: [],
    diary: [],
    calibrationLog: [],
    latencyLog: [],
    slippageLog: [],
    activityLog: [],
    disciplineLog: [],
    pomodoroLog: [],
    majorSystem: [],
    mnemonicTestLog: [],
    settings: [],
  } as unknown as ParsedBackup;
}

beforeEach(() => {
  resetTestSqliteState();
});

describe("import taxonomy integration", () => {
  it("persists subcategories + chapters and survives reload read", async () => {
    const parsed = makeParsed([
      makeCategory("cat-kriv", "Krivično pravo"),
      makeCategory("cat-grad", "Građansko pravo"),
    ]);

    expect(BackupSchema.safeParse(parsed).success).toBe(true);

    await applyImportAtomically({
      parsed,
      strategy: "overwrite",
      currentMap: {},
    });

    expect(getTestSqliteTable("categories")).toHaveLength(2);
    expect(getTestSqliteTable("subcategories")).toHaveLength(2);
    expect(getTestSqliteTable("chapters")).toHaveLength(4);

    const firstRead = await readAllCategoriesForBackup();
    const secondRead = await readAllCategoriesForBackup();

    expect(secondRead).toEqual(firstRead);

    const kriv = firstRead.find((c) => c.id === "cat-kriv");
    expect(kriv?.subcategories).toHaveLength(1);
    expect(kriv?.subcategories[0].chapters).toHaveLength(2);
    expect(kriv?.subcategories[0].chapters.map((ch) => ch.name)).toEqual([
      "Uvod",
      "Osnovni pojmovi",
    ]);
  });

  it("newer strategy merges richer taxonomy for an existing subject", async () => {
    const baseline = makeParsed([{
      id: "cat-a",
      name: "Krivično pravo",
      sortOrder: 0,
      subcategories: [{
        id: "sub-old",
        name: "Stari dio",
        sortOrder: 0,
        chapters: [{ id: "ch-old", name: "Legacy", sortOrder: 0 }],
      }],
    }]);

    await applyImportAtomically({
      parsed: baseline,
      strategy: "overwrite",
      currentMap: {},
    });

    const richer = makeParsed([makeCategory("cat-backup", "Krivično pravo")]);

    await applyImportAtomically({
      parsed: richer,
      strategy: "newer",
      currentMap: {},
    });

    const rows = await readAllCategoriesForBackup();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("cat-a");
    expect(rows[0].subcategories[0].chapters).toHaveLength(2);
    expect(getTestSqliteTable("chapters")).toHaveLength(2);
  });
});
