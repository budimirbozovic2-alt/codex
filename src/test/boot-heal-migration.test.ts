import { describe, it, expect, beforeEach } from "vitest";
import { makeCard } from "@/test/factories";
import { getTestSqlExecutor, resetTestSqliteState } from "@/test/sqlite-harness";
import {
  migrateLegacyKvScalars,
  migrateCardTaxonomyReferences,
  migrateLegacyFrequencyTags,
  migrateFsrsLastReviewed,
} from "@/lib/persistence/sqlite/boot-heal-migration";
import { migrateEditorV4Content } from "@/lib/persistence/sqlite/editor-v4-schema-migration";
import { runMigrations, TARGET_USER_VERSION } from "@/lib/persistence/sqlite/migration-runner";
import {
  bindCardInsert,
  CARD_INSERT_SQL,
} from "@/lib/persistence/sqlite/row-codecs";
import { LEGACY_FREQUENT_TAG } from "@/lib/sr/frequency";
import { SectionState } from "@/lib/spaced-repetition";
import { SUBCATEGORY_INSERT_SQL, CHAPTER_INSERT_SQL } from "@/lib/persistence/sqlite/category-codecs";

async function seedCategoryTaxonomy(exec: ReturnType<typeof getTestSqlExecutor>) {
  await exec.run(
    "INSERT OR REPLACE INTO categories (id, name, sortOrder, color, payload) VALUES (?, ?, ?, ?, ?)",
    ["cat-1", "Cat", 0, null, "{}"],
  );
  await exec.run(SUBCATEGORY_INSERT_SQL, ["sub-1", "cat-1", "Sub", 0]);
  await exec.run(CHAPTER_INSERT_SQL, ["ch-1", "sub-1", "Ch", 0]);
}

describe("boot heal schema migrations", () => {
  beforeEach(() => {
    resetTestSqliteState();
  });

  it("migrateLegacyKvScalars is idempotent", async () => {
    const exec = getTestSqlExecutor();
    await exec.run(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
      ["lastRedistribute", "2026-06-16"],
    );
    const first = await migrateLegacyKvScalars(exec);
    expect(first.healed).toBe(1);
    const second = await migrateLegacyKvScalars(exec);
    expect(second.healed).toBe(0);
  });

  it("migrateCardTaxonomyReferences clears stale subcategory/chapter ids", async () => {
    const exec = getTestSqlExecutor();
    await seedCategoryTaxonomy(exec);
    const card = makeCard({
      id: "stale-tax",
      categoryId: "cat-1",
      subcategoryId: "missing-sub",
      chapterId: "missing-ch",
    });
    await exec.run(CARD_INSERT_SQL, bindCardInsert(card));

    const result = await migrateCardTaxonomyReferences(exec);
    expect(result.patched).toBe(1);

    const rows = await exec.all<{ subcategoryId: string | null; chapterId: string | null }>(
      "SELECT subcategoryId, chapterId FROM cards WHERE id = ?",
      ["stale-tax"],
    );
    expect(rows[0]?.subcategoryId).toBe("");
    expect(rows[0]?.chapterId).toBe("");

    const again = await migrateCardTaxonomyReferences(exec);
    expect(again.patched).toBe(0);
  });

  it("migrateLegacyFrequencyTags moves legacy tag to frequencyTag", async () => {
    const exec = getTestSqlExecutor();
    const card = makeCard({
      id: "freq-1",
      tags: [LEGACY_FREQUENT_TAG, "other"],
    });
    await exec.run(CARD_INSERT_SQL, bindCardInsert(card));

    const result = await migrateLegacyFrequencyTags(exec);
    expect(result.migrated).toBe(1);

    const rows = await exec.all<{ frequencyTag: string | null; payload: string }>(
      "SELECT frequencyTag, payload FROM cards WHERE id = ?",
      ["freq-1"],
    );
    expect(rows[0]?.frequencyTag).toBe("često");
    const parsed = JSON.parse(rows[0]?.payload ?? "{}") as { tags?: string[] };
    expect(parsed.tags).toEqual(["other"]);
  });

  it("migrateFsrsLastReviewed backfills lastReviewed", async () => {
    const exec = getTestSqlExecutor();
    const now = Date.now();
    const card = makeCard({
      id: "fsrs-1",
      sections: [
        {
          id: "s1",
          title: "S",
          state: SectionState.Review,
          nextReview: now - 1000,
          interval: 3,
          elapsedDays: 0,
          stability: 2,
        },
      ],
    });
    await exec.run(CARD_INSERT_SQL, bindCardInsert(card));

    const result = await migrateFsrsLastReviewed(exec);
    expect(result.migrated).toBe(1);

    const rows = await exec.all<{ payload: string }>(
      "SELECT payload FROM cards WHERE id = ?",
      ["fsrs-1"],
    );
    const parsed = JSON.parse(rows[0]?.payload ?? "{}") as {
      sections: { lastReviewed?: number }[];
    };
    expect(parsed.sections[0]?.lastReviewed).toBeGreaterThan(0);
  });

  it("boot heal migrations set kv flags when run in sequence", async () => {
    expect(TARGET_USER_VERSION).toBe(17);
    const exec = getTestSqlExecutor();
    await migrateLegacyKvScalars(exec);
    await migrateCardTaxonomyReferences(exec);
    await migrateLegacyFrequencyTags(exec);
    await migrateFsrsLastReviewed(exec);
    await migrateEditorV4Content(exec);

    const expected = [
      "legacy-kv-scalars-healed-v1",
      "card-taxonomy-heal-v1",
      "legacy-frequency-tags-v1",
      "fsrs-last-reviewed-heal-v1",
      "editor-v4-content-migrated-v1",
    ];
    for (const key of expected) {
      const rows = await exec.all<{ value: string }>(
        "SELECT value FROM kv WHERE key = ?",
        [key],
      );
      expect(rows[0]?.value).toBe("1");
    }
  });

  it("migrateEditorV4Content is idempotent", async () => {
    const exec = getTestSqlExecutor();
    const first = await migrateEditorV4Content(exec);
    const second = await migrateEditorV4Content(exec);
    expect(first).toEqual(second);
    expect(second.cards).toBe(0);
  });

  it("runMigrations heals editor-v4 when already at target user_version", async () => {
    const exec = getTestSqlExecutor();
    await exec.run(`PRAGMA user_version = ${TARGET_USER_VERSION}`);
    const card = makeCard({
      id: "boot-v4",
      sections: [
        {
          id: "s1",
          title: "Legacy",
          content: "<p>[[Wiki link]]</p>",
        },
      ],
    });
    await exec.run(CARD_INSERT_SQL, bindCardInsert(card));

    await runMigrations(exec);

    const flag = await exec.all<{ value: string }>(
      "SELECT value FROM kv WHERE key = ?",
      ["editor-v4-content-migrated-v1"],
    );
    expect(flag[0]?.value).toBe("1");
  });
});
