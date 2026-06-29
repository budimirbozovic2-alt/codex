import { htmlToDoc } from "@/lib/editor-v4";
import type { CategoryRecord } from "@/lib/db-types";
import type { Card } from "@/lib/spaced-repetition";
import { SectionState } from "@/lib/spaced-repetition";
import { bulkPutCategories, listAllCategories } from "@/lib/db/queries";
import { cardRepository } from "@/lib/repositories";
import { runWriteSession } from "@/lib/query/write-session";
import {
  E2E_SMOKE_DELETE_CATEGORY_ID,
  E2E_SMOKE_DUE_CARD_ID,
  E2E_SMOKE_DUE_CATEGORY_ID,
  E2E_SMOKE_DUE_CARD_QUESTION,
} from "./fixture-ids";

export {
  E2E_SMOKE_DELETE_CATEGORY_ID,
  E2E_SMOKE_DUE_CATEGORY_ID,
  E2E_SMOKE_DUE_CARD_ID,
  E2E_SMOKE_DUE_CARD_QUESTION,
} from "./fixture-ids";

const DELETE_CATEGORY: CategoryRecord = {
  id: E2E_SMOKE_DELETE_CATEGORY_ID,
  name: "E2E Smoke Brisanje",
  sortOrder: 9997,
  subcategories: [],
};

const DUE_CATEGORY: CategoryRecord = {
  id: E2E_SMOKE_DUE_CATEGORY_ID,
  name: "E2E Smoke Review",
  sortOrder: 9996,
  subcategories: [],
};

function buildDueReviewCard(): Card {
  const now = Date.now();
  return {
    id: E2E_SMOKE_DUE_CARD_ID,
    question: E2E_SMOKE_DUE_CARD_QUESTION,
    sections: [
      {
        id: "e3333333-3333-4333-8333-333333333333",
        title: "Due sekcija",
        contentDoc: htmlToDoc("<p>E2E due review sadržaj.</p>"),
        state: SectionState.Learning,
        stability: 1.2,
        difficulty: 5,
        interval: 0,
        nextReview: now - 60_000,
        lastReviewed: now - 3_600_000,
        lapses: 1,
        elapsedDays: 0,
        scheduledDays: 0,
        firstReviewPending: false,
      },
    ],
    categoryId: E2E_SMOKE_DUE_CATEGORY_ID,
    createdAt: now,
    readCount: 1,
    type: "essay",
  };
}

/** Empty category for delete smoke (no cards). */
export async function seedEmptyCategoryForDelete(): Promise<{ categoryId: string }> {
  const existing = await listAllCategories();
  const merged = [
    ...existing.filter((c) => c.id !== E2E_SMOKE_DELETE_CATEGORY_ID),
    DELETE_CATEGORY,
  ];
  await runWriteSession(
    { cards: false, categories: true },
    async () => {
      await bulkPutCategories(merged);
      return merged;
    },
    (records) => ({ freshCategories: records }),
  );
  return { categoryId: E2E_SMOKE_DELETE_CATEGORY_ID };
}

/** Category + due card for review session smoke. */
export async function seedDueReviewFixture(): Promise<{
  categoryId: string;
  cardId: string;
}> {
  const existing = await listAllCategories();
  const merged = [
    ...existing.filter((c) => c.id !== E2E_SMOKE_DUE_CATEGORY_ID),
    DUE_CATEGORY,
  ];
  await runWriteSession(
    { cards: true, categories: true },
    async () => {
      await bulkPutCategories(merged);
      await cardRepository.bulkPut([buildDueReviewCard()], { skipNotify: true });
      return merged;
    },
    (records) => ({ freshCategories: records }),
  );
  return {
    categoryId: E2E_SMOKE_DUE_CATEGORY_ID,
    cardId: E2E_SMOKE_DUE_CARD_ID,
  };
}
