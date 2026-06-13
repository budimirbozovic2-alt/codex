import type { CategoryRecord } from "@/lib/db-types";
import type { Card } from "@/lib/spaced-repetition";
import { cardRepository } from "@/lib/repositories";
import { setCategoryStoreRecords } from "@/store/useCategoryStore";
import { setEditingCardId } from "@/store/useUIStore";
import { makeSection } from "../factories";

export const TEST_CATEGORY_ID = "cat-test";
export const TEST_CARD_A_ID = "card-a";
export const TEST_CARD_B_ID = "card-b";

export function makeTestCategory(
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord {
  return {
    id: TEST_CATEGORY_ID,
    name: "Testni predmet",
    sortOrder: 0,
    subcategories: [],
    ...overrides,
  };
}

export function makeTestCard(
  id: string,
  overrides: Partial<Card> = {},
): Card {
  return {
    id,
    question: id === TEST_CARD_A_ID ? "Pitanje A" : "Pitanje B",
    sections: [makeSection({ title: "Odgovor", html: "<p></p>" })],
    categoryId: TEST_CATEGORY_ID,
    createdAt: id === TEST_CARD_A_ID ? 100 : 200,
    type: "essay",
    ...overrides,
  } as Card;
}

export async function seedSubjectCardsFixture(): Promise<void> {
  setCategoryStoreRecords([makeTestCategory()]);
  await cardRepository.put(makeTestCard(TEST_CARD_A_ID));
  await cardRepository.put(makeTestCard(TEST_CARD_B_ID));
}

export function resetSubjectCardsHarness(path = `/subject/${TEST_CATEGORY_ID}/cards`): void {
  setEditingCardId(null);
  sessionStorage.clear();
  window.history.replaceState({}, "", path);
}
