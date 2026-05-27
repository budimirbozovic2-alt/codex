/**
 * A2 — categoryDeletion collapse. Verifies the Dexie-mirror path of
 * `cascadeDeleteCategoryDomains` (the SQLite/FK-CASCADE path is exercised
 * by `opfs-sqlite-adapter.test.ts` + the Electron smoke step).
 *
 * In vitest `tryGetExecutor` short-circuits (isElectron() === false) so
 * `categoryRepository.deleteAsync` becomes a no-op and the per-domain
 * Dexie helpers + KV scrub drive all observable state. That's the contract
 * we need to guard: the orchestrator wires the helpers correctly and KV
 * scrub still happens.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cascadeDeleteCategoryDomains } from "@/lib/category-deletion-service";
import { putSetting, getSetting } from "@/lib/db/queries";

const CAT_A = "cat-a";
const CAT_B = "cat-b";

async function seed(): Promise<void> {
  await Promise.all([
    db.categories.clear(),
    db.cards.clear(),
    db.sources.clear(),
    db.mindMaps.clear(),
    db.mnemonics.clear(),
    db.knowledgeBaseArticles.clear(),
    db.settings.clear(),
  ]);

  await db.categories.bulkPut([
    { id: CAT_A, name: "A", sortOrder: 0, subcategories: [] },
    { id: CAT_B, name: "B", sortOrder: 1, subcategories: [] },
  ]);

  await db.cards.bulkPut([
    { id: "k1", categoryId: CAT_A, subcategoryId: "s1", chapterId: "ch1",
      type: "essay", createdAt: 1, question: "Q1", sections: [], readCount: 0 },
    { id: "k2", categoryId: CAT_A, type: "essay", createdAt: 2,
      question: "Q2", sections: [], readCount: 0 },
    { id: "k3", categoryId: CAT_B, type: "essay", createdAt: 3,
      question: "Q3", sections: [], readCount: 0 },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any);

  await db.sources.bulkPut([
    { id: "src1", categoryId: CAT_A, title: "S1", version: 1, createdAt: 1, html: "" },
    { id: "src2", categoryId: CAT_B, title: "S2", version: 1, createdAt: 2, html: "" },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any);

  await db.mindMaps.bulkPut([
    { id: "mm1", categoryId: CAT_A, title: "M1", updatedAt: 1, nodes: [], edges: [] },
    { id: "mm2", categoryId: CAT_A, title: "M2", updatedAt: 2, nodes: [], edges: [] },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any);

  await db.mnemonics.bulkPut([
    { id: "mn1", categoryId: CAT_A, createdAt: 1, content: "" },
    { id: "mn2", categoryId: CAT_A, createdAt: 2, content: "" },
    { id: "mn3", categoryId: CAT_A, createdAt: 3, content: "" },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any);

  await db.knowledgeBaseArticles.bulkPut([
    { id: "kb1", subjectId: CAT_A, title: "T1", updatedAt: 1, body: "" },
    { id: "kb2", subjectId: CAT_A, title: "T2", updatedAt: 2, body: "" },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any);
}

describe("cascadeDeleteCategoryDomains — A2", () => {
  beforeEach(seed);

  it("purgeCards=true wipes cards/sources/mindMaps/mnemonics/articles for the category", async () => {
    const result = await cascadeDeleteCategoryDomains(CAT_A, {
      purgeCards: true, fallbackId: "",
    });

    expect(result.cardsAffected).toBe(2);
    expect(result.sourcesAffected).toBe(1);
    expect(result.mindMaps).toBe(2);
    expect(result.mnemonics).toBe(3);
    expect(result.articles).toBe(2);

    expect(await db.cards.where("categoryId").equals(CAT_A).count()).toBe(0);
    expect(await db.sources.where("categoryId").equals(CAT_A).count()).toBe(0);
    expect(await db.mindMaps.where("categoryId").equals(CAT_A).count()).toBe(0);
    expect(await db.mnemonics.where("categoryId").equals(CAT_A).count()).toBe(0);
    expect(await db.knowledgeBaseArticles.where("subjectId").equals(CAT_A).count()).toBe(0);

    // CAT_B untouched.
    expect(await db.cards.where("categoryId").equals(CAT_B).count()).toBe(1);
    expect(await db.sources.where("categoryId").equals(CAT_B).count()).toBe(1);
  });

  it("purgeCards=false re-parents cards/sources to fallback and clears sub/chapter", async () => {
    const result = await cascadeDeleteCategoryDomains(CAT_A, {
      purgeCards: false, fallbackId: CAT_B,
    });

    expect(result.cardsAffected).toBe(2);
    expect(result.sourcesAffected).toBe(1);
    expect(result.mindMaps).toBe(2);

    const movedCards = await db.cards.where("categoryId").equals(CAT_B).toArray();
    expect(movedCards.length).toBe(3); // 1 native + 2 reparented
    const k1 = movedCards.find(c => c.id === "k1");
    expect(k1?.subcategoryId).toBeUndefined();
    expect(k1?.chapterId).toBeUndefined();

    expect(await db.sources.where("categoryId").equals(CAT_B).count()).toBe(2);
    // Children with no FK story still got removed.
    expect(await db.mindMaps.where("categoryId").equals(CAT_A).count()).toBe(0);
    expect(await db.mnemonics.where("categoryId").equals(CAT_A).count()).toBe(0);
  });

  it("scrubs subject_settings KV and plannerConfig refs", async () => {
    await putSetting("subject_settings:" + CAT_A, { foo: "bar" });
    await putSetting("plannerConfig", {
      subjectOrder: [CAT_A, CAT_B],
      hardSubjects: [CAT_A],
      phases: [{ categories: [CAT_A, CAT_B] }],
    });

    const result = await cascadeDeleteCategoryDomains(CAT_A, {
      purgeCards: true, fallbackId: "",
    });

    expect(result.settings).toBe(1);
    expect(result.plannerScrubbed).toBe(true);
    expect(await getSetting("subject_settings:" + CAT_A)).toBeUndefined();
    const planner = await getSetting<{
      subjectOrder: string[]; hardSubjects: string[]; phases: { categories: string[] }[];
    }>("plannerConfig");
    expect(planner?.subjectOrder).toEqual([CAT_B]);
    expect(planner?.hardSubjects).toEqual([]);
    expect(planner?.phases?.[0]?.categories).toEqual([CAT_B]);
  });
});
