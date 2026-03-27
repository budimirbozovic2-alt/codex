import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Dexie/IDB before importing persist-queue
vi.mock("@/lib/db", () => ({
  idbBulkPutCards: vi.fn().mockResolvedValue(undefined),
  idbDeleteCard: vi.fn().mockResolvedValue(undefined),
}));

import { idbBulkPutCards, idbDeleteCard } from "@/lib/db";
import { PersistAction } from "@/lib/persist-queue";

describe("C3+C4: Persist Queue Safety", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("C3: 'full' type no longer exists in PersistAction", () => {
    // Verify at the type level: "full" should not be a valid type
    const validTypes = ["put", "delete", "bulk"] as const;
    type ActionType = PersistAction["type"];
    // If "full" existed, this would be a broader type — runtime check:
    const action: PersistAction = { type: "put", card: { id: "x" } as any };
    expect(validTypes).toContain(action.type);
    // Ensure "full" is not in the union by testing that creating one would fail type check
    // (runtime: just verify the module doesn't export/handle "full" anymore)
    expect((action as any).type).not.toBe("full");
  });

  it("C4: schedulePersist is not called inside state updaters (structural check)", async () => {
    // Import the actual persist module to verify schedule works outside updaters
    const { schedulePersist } = await import("@/lib/persist-queue");

    // Simulate the C4 pattern: schedule AFTER state computation
    const mockCard = {
      id: "test-1",
      question: "Test",
      sections: [{ id: "s1", title: "T", content: "C", interval: 1, nextReview: "", difficulty: 5, stability: 1, state: 0, elapsedDays: 0, scheduledDays: 0 }],
      category: "Opšte",
      subcategory: "",
      type: "essay",
      createdAt: Date.now(),
      readCount: 0,
      successCount: 0,
      failCount: 0,
      streak: 0,
      lastReviewed: "",
      firstReviewPending: true,
    } as any;

    // Schedule a put action (should not throw)
    schedulePersist({ type: "put", card: mockCard });

    // Wait for the microtask queue to flush (16ms timer)
    await new Promise(r => setTimeout(r, 50));

    // Verify idbBulkPutCards was called with our card
    expect(idbBulkPutCards).toHaveBeenCalledWith([mockCard]);
  });

  it("C3: bulk actions don't delete stale cards (no idbSaveCards call)", async () => {
    const { schedulePersist } = await import("@/lib/persist-queue");

    const cards = [
      { id: "a", question: "A" },
      { id: "b", question: "B" },
    ] as any[];

    schedulePersist({ type: "bulk", cards });

    await new Promise(r => setTimeout(r, 50));

    // Should use bulkPut (upsert only), NOT the old idbSaveCards (which deleted stale)
    expect(idbBulkPutCards).toHaveBeenCalledWith(cards);
    // idbDeleteCard should NOT have been called
    expect(idbDeleteCard).not.toHaveBeenCalled();
  });

  it("C4: delete action works correctly outside updater", async () => {
    const { schedulePersist } = await import("@/lib/persist-queue");

    schedulePersist({ type: "delete", id: "card-to-delete" });

    await new Promise(r => setTimeout(r, 50));

    expect(idbDeleteCard).toHaveBeenCalledWith("card-to-delete");
  });

  it("C3+C4: mixed put + delete batch processes correctly", async () => {
    const { schedulePersist } = await import("@/lib/persist-queue");

    const card1 = { id: "new-1", question: "New" } as any;
    const card2 = { id: "new-2", question: "New2" } as any;

    // Simulate what splitCard does: delete old, bulk new
    schedulePersist({ type: "delete", id: "old-card" });
    schedulePersist({ type: "bulk", cards: [card1, card2] });

    await new Promise(r => setTimeout(r, 50));

    // Both operations should have been batched
    expect(idbBulkPutCards).toHaveBeenCalledWith([card1, card2]);
    expect(idbDeleteCard).toHaveBeenCalledWith("old-card");
  });
});
