import { describe, it, expect } from "vitest";
import { SectionState } from "@/lib/spaced-repetition";
import { getCardMasteryLevel } from "@/lib/mastery";
import { cardRepository } from "@/lib/repositories";
import { masteryDistributionByCategoryFromDb } from "@/lib/db/queries";
import { computeCardMasteryLevel } from "@/lib/persistence/sqlite/card-mastery-score";
import { migrateCardMasteryLevels } from "@/lib/persistence/sqlite/card-mastery-level-migration";
import { getTestSqlExecutor } from "./sqlite-harness";
import { makeCard, makeSection } from "./factories";

function distributionFromCards(cards: ReturnType<typeof makeCard>[]) {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const card of cards) {
    counts[getCardMasteryLevel(card)]++;
  }
  return counts;
}

describe("mastery distribution by category", () => {
  it("returns empty buckets for a category with no cards", async () => {
    const dist = await masteryDistributionByCategoryFromDb("empty-cat");
    expect(dist).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("matches JS getCardMasteryLevel buckets after card writes", async () => {
    const newSection = makeSection({ html: "<p>n</p>" });
    const reviewed = makeSection({ html: "<p>r</p>" });
    reviewed.state = SectionState.Review;
    reviewed.stability = 30;
    reviewed.difficulty = 1;

    const cards = [
      makeCard({ id: "m1", categoryId: "cat-m", sections: [newSection] }),
      makeCard({ id: "m2", categoryId: "cat-m", sections: [reviewed] }),
      makeCard({ id: "m3", categoryId: "other", sections: [reviewed] }),
    ];

    await cardRepository.bulkPut(cards);

    const dist = await masteryDistributionByCategoryFromDb("cat-m");
    expect(dist).toEqual(distributionFromCards(cards.slice(0, 2)));
  });

  it("bindCardInsert writes mastery_level on put", async () => {
    const reviewed = makeSection({ html: "<p>x</p>" });
    reviewed.state = SectionState.Review;
    reviewed.stability = 30;
    reviewed.difficulty = 1;
    const card = makeCard({ id: "level-card", categoryId: "cat-level", sections: [reviewed] });

    await cardRepository.put(card);

    const exec = getTestSqlExecutor();
    const rows = await exec.all<{ mastery_level: number }>(
      "SELECT mastery_level FROM cards WHERE id = ?",
      [card.id],
    );
    expect(rows[0]?.mastery_level).toBe(computeCardMasteryLevel(card));
  });

  it("backfills mastery_level from stale zero rows (migration smoke)", async () => {
    const exec = getTestSqlExecutor();
    const reviewed = makeSection({ html: "<p>legacy</p>" });
    reviewed.state = SectionState.Review;
    reviewed.stability = 20;
    reviewed.difficulty = 2;
    const card = makeCard({ id: "legacy-level", categoryId: "cat-legacy", sections: [reviewed] });

    await cardRepository.put(card);
    await exec.run("UPDATE cards SET mastery_level = 0 WHERE id = ?", [card.id]);
    await exec.run("DELETE FROM kv WHERE key = ?", ["card-mastery-level-v1"]);

    const { migrated } = await migrateCardMasteryLevels(exec);
    expect(migrated).toBe(1);

    const dist = await masteryDistributionByCategoryFromDb("cat-legacy");
    expect(dist.reduce((a, b) => a + b, 0)).toBe(1);
    expect(dist[getCardMasteryLevel(card)]).toBe(1);
  });
});
