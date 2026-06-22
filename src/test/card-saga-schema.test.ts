import { describe, it, expect } from "vitest";
import { cardRepository } from "@/lib/repositories";
import {
  cardsByCategory,
  getCardsByIds,
} from "@/lib/db/queries";
import { decodeCard } from "@/lib/persistence/sqlite/row-codecs";
import { migrateCardSagaLinks } from "@/lib/persistence/sqlite/card-saga-links-migration";
import { getTestSqlExecutor } from "./sqlite-harness";
import { makeCard } from "@/test/factories";

describe("card saga schema (parentId / isEndangered)", () => {
  it("migrateCardSagaLinks is idempotent and exposes columns via PRAGMA", async () => {
    const exec = getTestSqlExecutor();
    await migrateCardSagaLinks(exec);
    const cols = await exec.all<{ name: string }>("PRAGMA table_info(cards)");
    const names = cols.map((c) => c.name);
    expect(names).toContain("parentId");
    expect(names).toContain("isEndangered");

    await migrateCardSagaLinks(exec);
    const colsAgain = await exec.all<{ name: string }>("PRAGMA table_info(cards)");
    expect(colsAgain.map((c) => c.name)).toEqual(names);
  });

  it("put persists parentId on flash satellite and isEndangered on essay", async () => {
    const essay = makeCard({
      id: "essay-1",
      categoryId: "cat-saga",
      type: "essay",
      question: "Esej pitanje?",
    });
    const flash = makeCard({
      id: "flash-1",
      categoryId: "cat-saga",
      type: "flash",
      question: "Blic pitanje?",
      parentId: essay.id,
    });
    const endangeredEssay = { ...essay, isEndangered: true };

    await cardRepository.put(essay);
    await cardRepository.put(flash);
    await cardRepository.put(endangeredEssay);

    const exec = getTestSqlExecutor();
    const flashRow = await exec.all<{ parentId: string | null; isEndangered: number }>(
      "SELECT parentId, isEndangered FROM cards WHERE id = ?",
      [flash.id],
    );
    expect(flashRow[0]?.parentId).toBe(essay.id);
    expect(flashRow[0]?.isEndangered).toBe(0);

    const essayRow = await exec.all<{ isEndangered: number }>(
      "SELECT isEndangered FROM cards WHERE id = ?",
      [essay.id],
    );
    expect(essayRow[0]?.isEndangered).toBe(1);
  });

  it("read layer round-trips parentId and isEndangered via decodeCard", async () => {
    const essay = makeCard({
      id: "essay-2",
      categoryId: "cat-saga-2",
      type: "essay",
      isEndangered: true,
    });
    const flash = makeCard({
      id: "flash-2",
      categoryId: "cat-saga-2",
      type: "flash",
      parentId: essay.id,
    });

    await cardRepository.bulkPut([essay, flash]);

    const [loadedFlash] = await getCardsByIds([flash.id]);
    expect(loadedFlash?.parentId).toBe(essay.id);
    expect(loadedFlash?.isEndangered).toBe(false);

    const categoryCards = await cardsByCategory("cat-saga-2");
    const loadedEssay = categoryCards.find((c) => c.id === essay.id);
    expect(loadedEssay?.isEndangered).toBe(true);
  });

  it("patch updates parentId in column and payload", async () => {
    const essayA = makeCard({ id: "essay-a", categoryId: "cat-patch", type: "essay" });
    const essayB = makeCard({ id: "essay-b", categoryId: "cat-patch", type: "essay" });
    const flash = makeCard({
      id: "flash-patch",
      categoryId: "cat-patch",
      type: "flash",
      parentId: essayA.id,
    });

    await cardRepository.bulkPut([essayA, essayB, flash]);

    await cardRepository.patch(flash.id, (c) => ({
      ...c,
      parentId: essayB.id,
    }));

    const exec = getTestSqlExecutor();
    const row = await exec.all<{ payload: string; parentId: string | null }>(
      "SELECT payload, parentId FROM cards WHERE id = ?",
      [flash.id],
    );
    expect(row[0]?.parentId).toBe(essayB.id);
    const payload = JSON.parse(String(row[0]?.payload)) as { parentId?: string };
    expect(payload.parentId).toBe(essayB.id);

    const decoded = decodeCard({
      id: flash.id,
      payload: row[0]!.payload,
      parentId: row[0]!.parentId,
      isEndangered: 0,
    });
    expect(decoded.parentId).toBe(essayB.id);
  });
});
