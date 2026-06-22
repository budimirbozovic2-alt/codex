import { describe, it, expect } from "vitest";
import { cardRepository } from "@/lib/repositories";
import { getCardsByIds } from "@/lib/db/queries";
import { getTestSqlExecutor } from "./sqlite-harness";
import { makeCard } from "@/test/factories";

async function seedReviewGrade(
  cardId: string,
  grade: number,
  timestamp = Date.now(),
): Promise<void> {
  const exec = getTestSqlExecutor();
  await exec.run(
    "INSERT INTO reviewLog (cardId, timestamp, payload) VALUES (?, ?, ?)",
    [
      cardId,
      timestamp,
      JSON.stringify({
        cardId,
        sectionId: "sec_test",
        grade,
        timestamp,
        category: "cat-endangered",
      }),
    ],
  );
}

function makeReviewLogEntry(
  cardId: string,
  grade: number,
  timestamp = Date.now(),
): {
  timestamp: number;
  cardId: string;
  sectionId: string;
  grade: number;
  category: string;
} {
  return {
    timestamp,
    cardId,
    sectionId: "sec_test",
    grade,
    category: "cat-endangered",
  };
}

describe("card saga endangered sync on grade", () => {
  it("sets parent isEndangered when flash satellite is graded 1 (Again)", async () => {
    const essay = makeCard({
      id: "essay-e1",
      categoryId: "cat-endangered",
      type: "essay",
    });
    const flash = makeCard({
      id: "flash-e1",
      categoryId: "cat-endangered",
      type: "flash",
      parentId: essay.id,
    });

    await cardRepository.bulkPut([essay, flash]);
    await cardRepository.patchWithReviewGrade(flash.id, 1, (c) => c);

    const [parent] = await getCardsByIds([essay.id]);
    expect(parent?.isEndangered).toBe(true);

    const exec = getTestSqlExecutor();
    const row = await exec.all<{ isEndangered: number }>(
      "SELECT isEndangered FROM cards WHERE id = ?",
      [essay.id],
    );
    expect(row[0]?.isEndangered).toBe(1);
  });

  it("does not touch parent when flash has no parentId", async () => {
    const essay = makeCard({
      id: "essay-e2",
      categoryId: "cat-endangered",
      type: "essay",
    });
    const flash = makeCard({
      id: "flash-e2",
      categoryId: "cat-endangered",
      type: "flash",
    });

    await cardRepository.bulkPut([essay, flash]);
    await cardRepository.patchWithReviewGrade(flash.id, 1, (c) => c);

    const [parent] = await getCardsByIds([essay.id]);
    expect(parent?.isEndangered).toBeFalsy();
  });

  it("clears parent isEndangered when all satellites last grade >= 3", async () => {
    const essay = makeCard({
      id: "essay-e3",
      categoryId: "cat-endangered",
      type: "essay",
      isEndangered: true,
    });
    const flashA = makeCard({
      id: "flash-e3a",
      categoryId: "cat-endangered",
      type: "flash",
      parentId: essay.id,
    });
    const flashB = makeCard({
      id: "flash-e3b",
      categoryId: "cat-endangered",
      type: "flash",
      parentId: essay.id,
    });

    await cardRepository.bulkPut([essay, flashA, flashB]);
    await seedReviewGrade(flashA.id, 3, Date.now() - 1000);

    await cardRepository.patchWithReviewGrade(flashB.id, 3, (c) => c);

    const [parent] = await getCardsByIds([essay.id]);
    expect(parent?.isEndangered).toBe(false);
  });

  it("keeps parent endangered when another satellite last grade < 3", async () => {
    const essay = makeCard({
      id: "essay-e4",
      categoryId: "cat-endangered",
      type: "essay",
      isEndangered: true,
    });
    const flashA = makeCard({
      id: "flash-e4a",
      categoryId: "cat-endangered",
      type: "flash",
      parentId: essay.id,
    });
    const flashB = makeCard({
      id: "flash-e4b",
      categoryId: "cat-endangered",
      type: "flash",
      parentId: essay.id,
    });

    await cardRepository.bulkPut([essay, flashA, flashB]);
    await seedReviewGrade(flashA.id, 1, Date.now() - 1000);

    await cardRepository.patchWithReviewGrade(flashB.id, 3, (c) => c);

    const [parent] = await getCardsByIds([essay.id]);
    expect(parent?.isEndangered).toBe(true);
  });

  it("clears endangered for a single satellite when graded >= 3", async () => {
    const essay = makeCard({
      id: "essay-e5",
      categoryId: "cat-endangered",
      type: "essay",
      isEndangered: true,
    });
    const flash = makeCard({
      id: "flash-e5",
      categoryId: "cat-endangered",
      type: "flash",
      parentId: essay.id,
    });

    await cardRepository.bulkPut([essay, flash]);
    await cardRepository.patchWithReviewGrade(flash.id, 4, (c) => c);

    const [parent] = await getCardsByIds([essay.id]);
    expect(parent?.isEndangered).toBe(false);
  });

  it("clears parent when both satellites are graded >= 3 in the same session (reviewLog in tx)", async () => {
    const essay = makeCard({
      id: "essay-e7",
      categoryId: "cat-endangered",
      type: "essay",
      isEndangered: true,
    });
    const flashA = makeCard({
      id: "flash-e7a",
      categoryId: "cat-endangered",
      type: "flash",
      parentId: essay.id,
    });
    const flashB = makeCard({
      id: "flash-e7b",
      categoryId: "cat-endangered",
      type: "flash",
      parentId: essay.id,
    });

    await cardRepository.bulkPut([essay, flashA, flashB]);

    await cardRepository.patchWithReviewGrade(
      flashA.id,
      3,
      (c) => c,
      makeReviewLogEntry(flashA.id, 3, Date.now() - 1000),
    );
    await cardRepository.patchWithReviewGrade(
      flashB.id,
      3,
      (c) => c,
      makeReviewLogEntry(flashB.id, 3),
    );

    const [parent] = await getCardsByIds([essay.id]);
    expect(parent?.isEndangered).toBe(false);
  });

  it("ignores grade 2 for endangered sync (no set, no clear)", async () => {
    const essay = makeCard({
      id: "essay-e6",
      categoryId: "cat-endangered",
      type: "essay",
      isEndangered: false,
    });
    const flash = makeCard({
      id: "flash-e6",
      categoryId: "cat-endangered",
      type: "flash",
      parentId: essay.id,
    });

    await cardRepository.bulkPut([essay, flash]);
    await cardRepository.patchWithReviewGrade(flash.id, 2, (c) => c);

    const [parent] = await getCardsByIds([essay.id]);
    expect(parent?.isEndangered).toBe(false);
  });
});
