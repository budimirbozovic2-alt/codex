import { describe, it, expect, beforeEach } from "vitest";
import { SectionState } from "@/lib/spaced-repetition";
import { cardRepository } from "@/lib/repositories";
import {
  getDueCardsFromDb,
  countDueCardsFromDb,
  countDueCardsByCategoryFromDb,
} from "@/lib/db/queries";
import { migrateCardSectionsIndex } from "@/lib/persistence/sqlite/card-sections-index-migration";
import { bindCardInsert, CARD_INSERT_SQL } from "@/lib/persistence/sqlite/row-codecs";
import { getTestSqlExecutor } from "./sqlite-harness";
import { makeCard, makeSection } from "@/test/factories";

describe("card_sections_index", () => {
  beforeEach(() => {
    // resetTestSqliteState via setup.ts
  });

  it("syncs index rows on put and finds due cards via SQL JOIN", async () => {
    const dueSection = makeSection({
      html: "<p>due</p>",
    });
    dueSection.state = SectionState.Review;
    dueSection.nextReview = Date.now() - 60_000;

    const futureSection = makeSection({ html: "<p>later</p>" });
    futureSection.state = SectionState.Review;
    futureSection.nextReview = Date.now() + 86_400_000;

    const dueCard = makeCard({
      id: "due-card",
      sections: [dueSection],
    });
    const futureCard = makeCard({
      id: "future-card",
      sections: [futureSection],
    });
    const newCard = makeCard({ id: "new-card" });

    await cardRepository.bulkPut([dueCard, futureCard, newCard]);

    const due = await getDueCardsFromDb(Date.now());
    expect(due.map((c) => c.id)).toEqual(["due-card"]);
    expect(await countDueCardsFromDb()).toBe(1);
  });

  it("removes index rows when card is deleted (CASCADE)", async () => {
    const section = makeSection({ html: "<p>x</p>" });
    section.state = SectionState.Learning;
    section.nextReview = 0;
    await cardRepository.put(makeCard({ id: "cascade-card", sections: [section] }));
    expect(await countDueCardsFromDb()).toBe(1);

    await cardRepository.remove("cascade-card");
    expect(await countDueCardsFromDb()).toBe(0);
  });

  it("updates index on patch when FSRS state changes", async () => {
    const section = makeSection({ html: "<p>patch</p>" });
    await cardRepository.put(makeCard({ id: "patch-card", sections: [section] }));
    expect(await countDueCardsFromDb()).toBe(0);

    await cardRepository.patch("patch-card", (card) => ({
      ...card,
      sections: card.sections.map((s) => ({
        ...s,
        state: SectionState.Review,
        nextReview: Date.now() - 1,
      })),
    }));

    expect(await countDueCardsFromDb()).toBe(1);
  });

  it("counts due cards per category via SQL JOIN", async () => {
    const catA = "cat-a";
    const catB = "cat-b";
    const dueSection = makeSection({ html: "<p>due</p>" });
    dueSection.state = SectionState.Review;
    dueSection.nextReview = Date.now() - 1;

    await cardRepository.bulkPut([
      makeCard({ id: "a1", categoryId: catA, sections: [dueSection] }),
      makeCard({ id: "b1", categoryId: catB, sections: [dueSection] }),
      makeCard({ id: "a2", categoryId: catA }),
    ]);

    expect(await countDueCardsByCategoryFromDb(catA)).toBe(1);
    expect(await countDueCardsByCategoryFromDb(catB)).toBe(1);
  });

  it("backfills card_sections_index from legacy payloads (migration smoke)", async () => {
    const exec = getTestSqlExecutor();
    const dueSection = makeSection({ html: "<p>migrate</p>" });
    dueSection.state = SectionState.Review;
    dueSection.nextReview = Date.now() - 1;
    const card = makeCard({ id: "legacy-card", sections: [dueSection] });

    await exec.run(CARD_INSERT_SQL, bindCardInsert(card));
    await exec.run("DELETE FROM card_sections_index WHERE card_id = ?", [card.id]);
    await exec.run("DELETE FROM kv WHERE key = ?", ["card-sections-index-v1"]);

    const { migrated } = await migrateCardSectionsIndex(exec);
    expect(migrated).toBe(1);
    expect(await countDueCardsFromDb()).toBe(1);
  });
});
