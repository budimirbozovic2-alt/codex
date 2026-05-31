/**
 * Backup-import end-to-end test: validates that
 *   1. an invalid backup file is rejected at the schema layer without
 *      touching SQLite,
 *   2. a valid backup file restores cleanly through the atomic
 *      `applyImportAtomically` orchestrator,
 *   3. a mid-transaction failure rolls SQLite back to the previous
 *      committed snapshot (no partial categories left behind).
 *
 * Uses the in-memory SQLite harness wired in `src/test/setup.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BackupSchema, type ParsedBackup } from "@/lib/migrations/backup-schema";
import type { CategoryRecord } from "@/lib/db-types";
import { getTestSqliteTable, resetTestSqliteState } from "./sqlite-harness";

// Controllable failure hook for the satellite writer.
const failFlag = { value: false };

vi.mock("@/lib/backup/write-satellite-tx", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/backup/write-satellite-tx")
  >("@/lib/backup/write-satellite-tx");
  return {
    ...actual,
    writeSatelliteTablesTx: vi.fn(async (...args: Parameters<typeof actual.writeSatelliteTablesTx>) => {
      if (failFlag.value) {
        throw new Error("simulated satellite write failure");
      }
      return actual.writeSatelliteTablesTx(...args);
    }),
  };
});

// Avoid touching the AppContext SSOT mirror during these isolated tests.
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

// Import AFTER mocks so the orchestrator binds the mocked symbol.
import { applyImportAtomically } from "@/lib/backup/import-transaction";

function makeCategory(id: string, name: string, sortOrder = 0): CategoryRecord {
  return { id, name, sortOrder, subcategories: [] };
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
  failFlag.value = false;
  resetTestSqliteState();
});

describe("backup import — invalid vs valid file (consistency contract)", () => {
  it("rejects a structurally invalid backup at the schema layer and leaves SQLite untouched", () => {
    // cards[0].sections must be an array.
    const result = BackupSchema.safeParse({
      version: 7,
      cards: [{ id: "c1", question: "q", sections: "not-an-array", categoryId: "x" }],
      categories: [],
    });

    expect(result.success).toBe(false);
    expect(getTestSqliteTable("categories")).toHaveLength(0);
  });

  it("restores a valid backup through the atomic orchestrator", async () => {
    const parsed = makeParsed([
      makeCategory("cat-a", "Krivično pravo", 0),
      makeCategory("cat-b", "Građansko pravo", 1),
    ]);

    const result = await applyImportAtomically({
      parsed,
      strategy: "overwrite",
      currentMap: {},
    });

    expect(result.freshCategories.map((c) => c.id).sort()).toEqual(["cat-a", "cat-b"]);
    const rows = getTestSqliteTable("categories");
    expect(rows.map((r) => r.id).sort()).toEqual(["cat-a", "cat-b"]);
  });

  it("rolls SQLite back to the previous committed state when a mid-transaction step throws", async () => {
    // Step 1 — establish a known baseline.
    const baseline = makeParsed([
      makeCategory("cat-a", "Krivično pravo", 0),
      makeCategory("cat-b", "Građansko pravo", 1),
    ]);
    await applyImportAtomically({
      parsed: baseline,
      strategy: "overwrite",
      currentMap: {},
    });

    const baselineSnapshot = getTestSqliteTable("categories")
      .map((r) => ({ id: r.id, name: r.name }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    expect(baselineSnapshot.map((r) => r.id)).toEqual(["cat-a", "cat-b"]);

    // Step 2 — second restore that throws inside the satellite phase.
    failFlag.value = true;
    const breaking = makeParsed([
      makeCategory("cat-x", "Trgovinsko pravo", 0),
      makeCategory("cat-y", "Upravno pravo", 1),
      makeCategory("cat-z", "Radno pravo", 2),
    ]);

    await expect(
      applyImportAtomically({
        parsed: breaking,
        strategy: "overwrite",
        currentMap: {},
      }),
    ).rejects.toThrow(/simulated satellite write failure/);

    // Step 3 — categories table must equal the pre-failure snapshot.
    const after = getTestSqliteTable("categories")
      .map((r) => ({ id: r.id, name: r.name }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    expect(after).toEqual(baselineSnapshot);
    // None of the breaking import's IDs leaked through.
    expect(after.find((r) => String(r.id).startsWith("cat-x"))).toBeUndefined();
    expect(after.find((r) => String(r.id).startsWith("cat-y"))).toBeUndefined();
    expect(after.find((r) => String(r.id).startsWith("cat-z"))).toBeUndefined();
  });

  it("strips React Flow runtime keys from mind map nodes/edges instead of failing validation", () => {
    const result = BackupSchema.safeParse({
      version: 7,
      type: "full",
      cards: [],
      categories: [],
      sources: [],
      mindMaps: [
        {
          id: "mm-1",
          categoryId: "cat-a",
          title: "Test map",
          mode: "hierarchy",
          nodes: [
            {
              id: "n1",
              type: "default",
              position: { x: 0, y: 0 },
              data: { label: "Root" },
              // React Flow runtime-internal flags that must be silently dropped:
              measured: { width: 120, height: 40 },
              selected: false,
              dragging: false,
              positionAbsolute: { x: 0, y: 0 },
              width: 120,
              height: 40,
            },
          ],
          edges: [
            {
              id: "e1",
              source: "n1",
              target: "n1",
              selected: false,
              animated: true,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      knowledgeBaseArticles: [],
      mnemonics: [],
      reviewLog: [],
      diary: [],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const node = result.data.mindMaps[0].nodes[0] as Record<string, unknown>;
    expect(node.id).toBe("n1");
    expect("measured" in node).toBe(false);
    expect("selected" in node).toBe(false);
    expect("dragging" in node).toBe(false);
    const edge = result.data.mindMaps[0].edges[0] as Record<string, unknown>;
    expect("selected" in edge).toBe(false);
    expect("animated" in edge).toBe(false);
  });
});
