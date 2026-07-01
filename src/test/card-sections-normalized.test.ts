import { describe, expect, it, beforeEach } from "vitest";
import { makeCard, makeSection } from "@/test/factories";
import { SectionState } from "@/lib/spaced-repetition";
import { cardRepository } from "@/lib/repositories";
import {
  countDueCardsFromDb,
  getDueCardsFromDb,
} from "@/lib/db/queries";
import {
  getHealDefinitionsForUpgrade,
  runPostMigrationHeals,
} from "@/lib/persistence/sqlite/post-migration-heals";
import { migrateCardSectionsNormalized } from "@/lib/persistence/sqlite/card-sections-migration";
import {
  getTestSqlExecutor,
  getTestSqliteTable,
  resetTestSqliteState,
} from "@/test/sqlite-harness";
import { decodeCard } from "@/lib/persistence/sqlite/row-codecs";

describe("card_sections normalized (TD-ARCH-8)", () => {
  beforeEach(() => {
    resetTestSqliteState();
  });

  it("syncCardSections persists full FSRS columns", async () => {
    const now = Date.now();
    const section = makeSection({ html: "<p>x</p>" });
    section.state = SectionState.Review;
    section.stability = 4.2;
    section.difficulty = 5.1;
    section.interval = 3;
    section.nextReview = now + 86_400_000;
    section.lastReviewed = now - 86_400_000;
    section.lapses = 2;
    section.elapsedDays = 1;
    section.scheduledDays = 3;
    section.firstReviewPending = false;

    await cardRepository.put(makeCard({ id: "fsrs-1", sections: [section] }));

    const rows = getTestSqliteTable("card_sections");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      card_id: "fsrs-1",
      section_id: section.id,
      state: SectionState.Review,
      stability: 4.2,
      difficulty: 5.1,
      interval_days: 3,
      next_review: now + 86_400_000,
      last_reviewed: now - 86_400_000,
      lapses: 2,
      elapsed_days: 1,
      scheduled_days: 3,
      first_review_pending: 0,
    });
  });

  it("due queries read from card_sections", async () => {
    const now = Date.now();
    const dueSection = makeSection({ html: "<p>due</p>" });
    dueSection.state = SectionState.Review;
    dueSection.nextReview = now - 1;

    await cardRepository.put(
      makeCard({ id: "due-1", sections: [dueSection] }),
    );

    expect(await countDueCardsFromDb(now)).toBe(1);
    const due = await getDueCardsFromDb(now, 10);
    expect(due.map((c) => c.id)).toEqual(["due-1"]);
  });

  it("migrateCardSectionsNormalized backfills from card JSON", async () => {
    await cardRepository.put(makeCard({ id: "heal-1" }));

    const exec = getTestSqlExecutor();
    await exec.run("DELETE FROM card_sections");

    const result = await migrateCardSectionsNormalized(exec);
    expect(result.migrated).toBe(1);

    const rows = getTestSqliteTable("card_sections");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.card_id).toBe("heal-1");

    const flag = await exec.all<{ value: string }>(
      "SELECT value FROM kv WHERE key = ? LIMIT 1",
      ["card-sections-normalized-v1"],
    );
    expect(flag[0]?.value).toBe("1");

    const second = await migrateCardSectionsNormalized(exec);
    expect(second.migrated).toBe(0);
  });

  it("includes card-sections-normalized heal when upgrading 16 → 17", () => {
    const heals = getHealDefinitionsForUpgrade({ fromVersion: 16, toVersion: 17 });
    expect(heals.map((h) => h.name)).toEqual(["card-sections-normalized"]);
  });

  it("card-sections-index heal delegates to normalized migration when table exists", async () => {
    await cardRepository.put(makeCard({ id: "delegate-1" }));

    const exec = getTestSqlExecutor();
    await exec.run("DELETE FROM card_sections");

    const { migrateCardSectionsIndex } = await import(
      "@/lib/persistence/sqlite/card-sections-index-migration"
    );
    const result = await migrateCardSectionsIndex(exec);
    expect(result.migrated).toBe(1);
    expect(getTestSqliteTable("card_sections").length).toBeGreaterThan(0);
  });
});

describe("runMigrations v17 (TD-ARCH-8)", () => {
  beforeEach(() => {
    resetTestSqliteState();
  });

  it("TARGET_USER_VERSION is 18", async () => {
    const { TARGET_USER_VERSION } = await import(
      "@/lib/persistence/sqlite/migration-runner"
    );
    expect(TARGET_USER_VERSION).toBe(18);
  });

  it("post-migration heal 16 → 17 backfills card_sections", async () => {
    const card = makeCard({ id: "up-1" });
    await cardRepository.put(card);

    const exec = getTestSqlExecutor();
    await exec.run("DELETE FROM card_sections");

    const report = await runPostMigrationHeals(exec, {
      fromVersion: 16,
      toVersion: 17,
    });

    expect(report.steps.some((s) => s.name === "card-sections-normalized")).toBe(
      true,
    );
    expect(getTestSqliteTable("card_sections").length).toBe(card.sections.length);

    const rows = await exec.all<{ payload: string }>(
      "SELECT payload FROM cards WHERE id = ?",
      ["up-1"],
    );
    expect(decodeCard(rows[0]!).id).toBe("up-1");
  });
});
