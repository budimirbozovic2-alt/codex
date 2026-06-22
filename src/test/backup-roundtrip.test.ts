/**
 * Faza 0 — backup roundtrip contract: export → parse → import → COUNT + decode.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CategoryRecord } from "@/lib/db-types";
import { makeCard } from "@/test/factories";
import {
  putCardDirect,
  bulkPutCategories,
  listAllCards,
  countAllCards,
  readAllCategoriesForBackup,
} from "@/lib/db/queries";
import { resetTestSqliteState } from "./sqlite-harness";
import {
  buildFullBackupBlob,
  buildFullBackupPayload,
  parseBackupPayload,
  importParsedBackup,
} from "./helpers/backup-roundtrip";
import {
  assertNoDecodeGap,
  assertNoCategoryDecodeGap,
  simulateAppSessionReset,
} from "./helpers/persistence-contract";
import {
  ensureCardsBootCache,
  getCardsCacheWriteGeneration,
  getCardsHydrated,
} from "@/lib/query/cards-cache-coordinator";
import {
  ensureCategoriesBootCache,
  getCategoriesCacheWriteGeneration,
  getCategoriesHydrated,
} from "@/lib/query/categories-cache-coordinator";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { INTEGRATION_TEST_TIMEOUT_MS } from "@/test/helpers/test-timeouts";

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

const ROUNDTRIP_CAT: CategoryRecord = {
  id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1",
  name: "Roundtrip Predmet",
  sortOrder: 0,
  subcategories: [
    {
      id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb1",
      name: "Opšti dio",
      sortOrder: 0,
      chapters: [
        { id: "cccccccc-cccc-4ccc-cccc-ccccccccccc1", name: "Uvod", sortOrder: 0 },
      ],
    },
  ],
};

const CARD_A = makeCard({
  id: "dddddddd-dddd-4ddd-dddd-dddddddddddd1",
  question: "Roundtrip kartica A?",
  categoryId: ROUNDTRIP_CAT.id,
  subcategoryId: ROUNDTRIP_CAT.subcategories[0].id,
  chapterId: ROUNDTRIP_CAT.subcategories[0].chapters[0].id,
});

const CARD_B = makeCard({
  id: "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee1",
  question: "Roundtrip kartica B?",
  categoryId: ROUNDTRIP_CAT.id,
  subcategoryId: ROUNDTRIP_CAT.subcategories[0].id,
  chapterId: ROUNDTRIP_CAT.subcategories[0].chapters[0].id,
});

beforeEach(async () => {
  resetTestSqliteState();
  simulateAppSessionReset({ resetBoot: true });
  await bulkPutCategories([ROUNDTRIP_CAT]);
  await putCardDirect(CARD_A);
  await putCardDirect(CARD_B);
});

describe("backup roundtrip contract (Faza 0)", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  it("export → import preserves card COUNT and decode", async () => {
    expect(await countAllCards()).toBe(2);

    const payload = await buildFullBackupPayload();
    const wire = JSON.stringify(payload);
    const parsed = parseBackupPayload(JSON.parse(wire));
    expect(parsed.cards).toHaveLength(2);
    expect(parsed.categories).toHaveLength(1);

    const blob = await buildFullBackupBlob();
    expect(blob.size).toBeGreaterThan(0);

    resetTestSqliteState();
    simulateAppSessionReset({ resetBoot: true });

    await importParsedBackup(parsed);

    expect(await countAllCards()).toBe(2);
    await assertNoDecodeGap("backup-roundtrip");
    await assertNoCategoryDecodeGap("backup-roundtrip");

    const cards = await listAllCards();
    const questions = cards.map((c) => c.question).sort();
    expect(questions).toEqual([
      "Roundtrip kartica A?",
      "Roundtrip kartica B?",
    ]);

    const categories = await readAllCategoriesForBackup();
    expect(categories[0]?.subcategories[0]?.chapters).toHaveLength(1);
  });

  it("survives simulated session restart after roundtrip import", async () => {
    const parsed = parseBackupPayload(await buildFullBackupPayload());

    resetTestSqliteState();
    simulateAppSessionReset({ resetBoot: true });
    await importParsedBackup(parsed);

    simulateAppSessionReset({ resetBoot: true });

    const cardCount = await ensureCardsBootCache(getCardsCacheWriteGeneration());
    const catCount = await ensureCategoriesBootCache(
      getCategoriesCacheWriteGeneration(),
    );

    expect(cardCount).toBe(2);
    expect(catCount).toBeGreaterThanOrEqual(1);
    expect(getCardsHydrated()).toBe(true);
    expect(getCategoriesHydrated()).toBe(true);

    const cached = queryClient.getQueryData<{ id: string }[]>(
      queryKeys.cards.all(),
    );
    expect(cached?.map((c) => c.id).sort()).toEqual(
      [CARD_A.id, CARD_B.id].sort(),
    );

    await assertNoDecodeGap("backup-roundtrip-restart");
  });
});
