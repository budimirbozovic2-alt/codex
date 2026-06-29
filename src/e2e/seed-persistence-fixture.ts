import { htmlToDoc } from "@/lib/editor-v4";
import type { CategoryRecord } from "@/lib/db-types";
import type { Card } from "@/lib/spaced-repetition";
import { SectionState } from "@/lib/spaced-repetition";
import {
  bulkPutCategories,
  listAllCategories,
} from "@/lib/db/queries";
import { cardRepository } from "@/lib/repositories";
import { runWriteSession } from "@/lib/query/write-session";
import {
  E2E_PERSIST_CATEGORY_ID,
  E2E_PERSIST_CARD_ID,
  E2E_PERSIST_CARD_QUESTION,
} from "./fixture-ids";

export {
  E2E_PERSIST_CATEGORY_ID,
  E2E_PERSIST_CARD_ID,
  E2E_PERSIST_CARD_QUESTION,
} from "./fixture-ids";

const E2E_PERSIST_CATEGORY: CategoryRecord = {
  id: E2E_PERSIST_CATEGORY_ID,
  name: "E2E Persist Kategorija",
  sortOrder: 9998,
  subcategories: [],
};

function buildPersistCard(): Card {
  const now = Date.now();
  return {
    id: E2E_PERSIST_CARD_ID,
    question: E2E_PERSIST_CARD_QUESTION,
    sections: [
      {
        id: "f3333333-3333-4333-8333-333333333333",
        title: "Cjelina 1",
        contentDoc: htmlToDoc("<p>E2E persist sadržaj.</p>"),
        state: SectionState.New,
        stability: 0,
        difficulty: 0,
        interval: 0,
        nextReview: 0,
        lastReviewed: null,
        lapses: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        firstReviewPending: true,
      },
    ],
    categoryId: E2E_PERSIST_CATEGORY_ID,
    createdAt: now,
    readCount: 0,
    type: "essay",
  };
}

/** Seed one category + card for persistence restart E2E. */
export async function seedPersistenceFixture(): Promise<{
  categoryId: string;
  cardId: string;
  cardQuestion: string;
}> {
  const existing = await listAllCategories();
  const merged = [
    ...existing.filter((c) => c.id !== E2E_PERSIST_CATEGORY_ID),
    E2E_PERSIST_CATEGORY,
  ];
  await runWriteSession(
    { cards: true, categories: true },
    async () => {
      await bulkPutCategories(merged);
      const persisted = await listAllCategories();
      if (!persisted.some((c) => c.id === E2E_PERSIST_CATEGORY_ID)) {
        throw new Error("E2E seed: category missing after bulkPutCategories");
      }
      await cardRepository.bulkPut([buildPersistCard()], { skipNotify: true });
      return persisted;
    },
    (persisted) => ({ freshCategories: persisted }),
  );

  return {
    categoryId: E2E_PERSIST_CATEGORY_ID,
    cardId: E2E_PERSIST_CARD_ID,
    cardQuestion: E2E_PERSIST_CARD_QUESTION,
  };
}
