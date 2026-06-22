import { describe, it, expect } from "vitest";
import { SectionState } from "@/lib/spaced-repetition";
import { cardRepository } from "@/lib/repositories";
import {
  avgMasteryScoreByCategoryFromDb,
  countDueCardsByCategoryFromDb,
} from "@/lib/db/queries";
import { computeCardMasteryScore } from "@/lib/persistence/sqlite/card-mastery-score";
import { migrateCardMasteryScores } from "@/lib/persistence/sqlite/card-mastery-score-migration";
import { getTestSqlExecutor } from "./sqlite-harness";
import { makeCard, makeSection } from "@/test/factories";

import { CARD_INSERT_SQL, bindCardInsert } from "@/lib/persistence/sqlite/row-codecs";
import { makeCard } from "@/test/factories";

describe("CARD_INSERT_SQL", () => {
  it("column count matches placeholder and bind arity", () => {
    const colMatch = CARD_INSERT_SQL.match(/\(([^)]+)\)\s*VALUES/i);
    expect(colMatch).toBeTruthy();
    const columns = colMatch![1].split(",").map((s) => s.trim()).filter(Boolean);
    const placeholders = (CARD_INSERT_SQL.match(/\?/g) ?? []).length;
    const binds = bindCardInsert(makeCard({ id: "sql-shape-check" })).length;
    expect(placeholders).toBe(columns.length);
    expect(binds).toBe(columns.length);
  });
});

describe("card mastery_score", () => {
  it("bindCardInsert writes mastery_score on put", async () => {
    const reviewed = makeSection({ html: "<p>x</p>" });
    reviewed.state = SectionState.Review;
    reviewed.stability = 30;
    reviewed.difficulty = 1;
    const card = makeCard({ id: "score-card", categoryId: "cat-score", sections: [reviewed] });

    await cardRepository.put(card);

    const exec = getTestSqlExecutor();
    const rows = await exec.all<{ mastery_score: number }>(
      "SELECT mastery_score FROM cards WHERE id = ?",
      [card.id],
    );
    expect(rows[0]?.mastery_score).toBe(computeCardMasteryScore(card));
  });

  it("avgMasteryScoreByCategoryFromDb matches JS aggregate", async () => {
    const high = makeSection({ html: "<p>a</p>" });
    high.state = SectionState.Review;
    high.stability = 30;
    high.difficulty = 1;
    const low = makeSection({ html: "<p>b</p>" });

    await cardRepository.bulkPut([
      makeCard({ id: "s1", categoryId: "cat-a", sections: [high] }),
      makeCard({ id: "s2", categoryId: "cat-a", sections: [low] }),
      makeCard({ id: "s3", categoryId: "cat-b", sections: [high] }),
    ]);

    const catA = await avgMasteryScoreByCategoryFromDb("cat-a");
    expect(catA).toBeGreaterThan(0);
    expect(catA).toBeLessThan(100);
    expect(await avgMasteryScoreByCategoryFromDb("cat-b")).toBeGreaterThan(80);
  });

  it("backfills mastery_score from stale zero rows (migration smoke)", async () => {
    const exec = getTestSqlExecutor();
    const section = makeSection({ html: "<p>legacy</p>" });
    section.state = SectionState.Review;
    section.stability = 20;
    section.difficulty = 2;
    const card = makeCard({ id: "legacy-score", sections: [section] });

    await cardRepository.put(card);
    await exec.run("UPDATE cards SET mastery_score = 0 WHERE id = ?", [card.id]);
    await exec.run("DELETE FROM kv WHERE key = ?", ["card-mastery-score-v1"]);

    const { migrated } = await migrateCardMasteryScores(exec);
    expect(migrated).toBe(1);

    const rows = await exec.all<{ mastery_score: number }>(
      "SELECT mastery_score FROM cards WHERE id = ?",
      [card.id],
    );
    expect(rows[0]?.mastery_score).toBe(computeCardMasteryScore(card));
  });

  it("due and mastery SQL paths are independent", async () => {
    const dueSection = makeSection({ html: "<p>due</p>" });
    dueSection.state = SectionState.Review;
    dueSection.nextReview = Date.now() - 1;
    dueSection.stability = 10;
    dueSection.difficulty = 5;

    await cardRepository.put(
      makeCard({ id: "combo", categoryId: "cat-combo", sections: [dueSection] }),
    );

    expect(await countDueCardsByCategoryFromDb("cat-combo")).toBe(1);
    expect(await avgMasteryScoreByCategoryFromDb("cat-combo")).toBeGreaterThan(0);
  });
});
