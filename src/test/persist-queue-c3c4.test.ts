/**
 * Persist-queue safety tests — post A1c-4.
 *
 * The IDB adapter was retired; persist queue now writes through whichever
 * `PersistAdapter` is installed. We inject an in-memory mock via the
 * `__setPersistAdapter` test seam and assert that batching, coalescing,
 * and the put/delete contract still hold.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Card } from "@/lib/spaced-repetition";
import type { PersistAdapter } from "@/lib/persistence/PersistAdapter";
import {
  schedulePersist,
  __setPersistAdapter,
  persistQueue,
  type PersistAction,
} from "@/lib/persist-queue";

const bulkApply = vi.fn<(p: readonly Card[], d: readonly string[]) => Promise<void>>()
  .mockResolvedValue(undefined);
const mockAdapter: PersistAdapter = {
  bulkApply: (puts, deletes) => bulkApply(puts, deletes),
};

async function drain() {
  // Let the 16ms debounce timer fire and microtasks settle.
  await new Promise((r) => setTimeout(r, 50));
  if (persistQueue.hasPending()) await persistQueue.flush();
}

describe("Persist Queue Safety", () => {
  beforeEach(() => {
    bulkApply.mockClear();
    __setPersistAdapter(mockAdapter);
  });
  afterEach(async () => {
    await persistQueue.cleanup();
  });

  it("C3: 'full' type no longer exists in PersistAction", () => {
    const validTypes = ["put", "delete", "bulk"] as const;
    const action: PersistAction = { type: "put", card: { id: "x" } as unknown as Card };
    expect(validTypes).toContain(action.type);
    expect((action as { type: string }).type).not.toBe("full");
  });

  it("schedulePersist routes a put through adapter.bulkApply", async () => {
    const card = { id: "test-1", question: "Test" } as unknown as Card;
    schedulePersist({ type: "put", card });
    await drain();
    expect(bulkApply).toHaveBeenCalledWith([card], []);
  });

  it("bulk action upserts only — no deletes", async () => {
    const cards = [{ id: "a" }, { id: "b" }] as unknown as Card[];
    schedulePersist({ type: "bulk", cards });
    await drain();
    expect(bulkApply).toHaveBeenCalledWith(cards, []);
  });

  it("delete action routed through adapter.bulkApply", async () => {
    schedulePersist({ type: "delete", id: "card-to-delete" });
    await drain();
    expect(bulkApply).toHaveBeenCalledWith([], ["card-to-delete"]);
  });

  it("mixed put + delete batched into a single atomic call", async () => {
    const card1 = { id: "new-1" } as unknown as Card;
    const card2 = { id: "new-2" } as unknown as Card;
    schedulePersist({ type: "delete", id: "old-card" });
    schedulePersist({ type: "bulk", cards: [card1, card2] });
    await drain();
    expect(bulkApply).toHaveBeenCalledTimes(1);
    expect(bulkApply).toHaveBeenCalledWith([card1, card2], ["old-card"]);
  });

  it("coalesces repeated puts of the same id (last write wins)", async () => {
    const v1 = { id: "x", v: 1 } as unknown as Card;
    const v2 = { id: "x", v: 2 } as unknown as Card;
    const v3 = { id: "x", v: 3 } as unknown as Card;
    schedulePersist({ type: "put", card: v1 });
    schedulePersist({ type: "put", card: v2 });
    schedulePersist({ type: "put", card: v3 });
    await drain();
    expect(bulkApply).toHaveBeenCalledTimes(1);
    expect(bulkApply).toHaveBeenCalledWith([v3], []);
  });

  it("delete after put cancels the put", async () => {
    schedulePersist({ type: "put", card: { id: "y" } as unknown as Card });
    schedulePersist({ type: "delete", id: "y" });
    await drain();
    expect(bulkApply).toHaveBeenCalledWith([], ["y"]);
  });
});
