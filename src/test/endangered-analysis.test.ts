import { describe, it, expect } from "vitest";
import {
  findEndangeredCause,
  buildEndangeredEssaySummaries,
  formatEndangeredCauseLine,
} from "@/lib/saga/endangered-analysis";
import { makeCard } from "@/test/factories";
import type { ReviewLogEntry } from "@/lib/types/logs";

function logEntry(
  cardId: string,
  grade: number,
  timestamp: number,
): ReviewLogEntry {
  return {
    cardId,
    sectionId: "sec-1",
    grade,
    timestamp,
    category: "cat-1",
  };
}

describe("endangered-analysis", () => {
  const essay = makeCard({ id: "e1", type: "essay", question: "Esej o krivičnom pravu?" });
  const flashA = makeCard({
    id: "f1",
    type: "flash",
    parentId: "e1",
    question: "Šta je določaj?",
  });
  const flashB = makeCard({
    id: "f2",
    type: "flash",
    parentId: "e1",
    question: "Šta je pokušaj?",
  });

  it("findEndangeredCause returns most recent Again on satellites", () => {
    const reviewLog = [
      logEntry("f1", 1, 1000),
      logEntry("f2", 1, 2000),
      logEntry("f2", 3, 3000),
    ];
    const cause = findEndangeredCause(essay, [essay, flashA, flashB], reviewLog);
    expect(cause?.satelliteId).toBe("f2");
    expect(cause?.grade).toBe(1);
  });

  it("buildEndangeredEssaySummaries includes satellite counts", () => {
    const summaries = buildEndangeredEssaySummaries(
      [{ ...essay, isEndangered: true }],
      [essay, flashA, flashB],
      [logEntry("f2", 1, 500)],
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.satelliteCount).toBe(2);
    expect(summaries[0]?.cause?.satelliteId).toBe("f2");
  });

  it("formatEndangeredCauseLine handles missing cause", () => {
    expect(formatEndangeredCauseLine(null)).toMatch(/Ponovo/);
  });
});
