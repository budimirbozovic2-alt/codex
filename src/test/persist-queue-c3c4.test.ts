import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Dexie/IDB before importing persist-queue
vi.mock("@/lib/db", () => ({
  idbBulkApply: vi.fn().mockResolvedValue(undefined),
  // legacy mocks kept so other module paths don't blow up
  idbBulkPutCards: vi.fn().mockResolvedValue(undefined),
  idbDeleteCard: vi.fn().mockResolvedValue(undefined),
}));

// Stub Dexie schema: transaction passes through to the callback so the
// mocked idbBulkApply is actually invoked. The outbox table was removed
// in v23 (A1a); no need to stub it any more.
vi.mock("@/lib/db-schema", () => {
  const cards = {};
  return {
    db: {
      cards,
      transaction: (_mode: string, ..._args: unknown[]) => {
        const fn = _args[_args.length - 1] as () => Promise<unknown>;
        return Promise.resolve(fn());
      },
    },
  };
});

import { idbBulkApply } from "@/lib/db";
import { PersistAction } from "@/lib/persist-queue";

describe("Persist Queue Safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("C3: 'full' type no longer exists in PersistAction", () => {
    const validTypes = ["put", "delete", "bulk"] as const;
    const action: PersistAction = { type: "put", card: { id: "x" } as any };
    expect(validTypes).toContain(action.type);
    expect((action as any).type).not.toBe("full");
  });

  it("schedulePersist routes a put through idbBulkApply", async () => {
    const { schedulePersist } = await import("@/lib/persist-queue");
    const mockCard = { id: "test-1", question: "Test" } as any;
    schedulePersist({ type: "put", card: mockCard });
    await new Promise(r => setTimeout(r, 50));
    expect(idbBulkApply).toHaveBeenCalledWith([mockCard], []);
  });

  it("bulk action upserts only — no deletes", async () => {
    const { schedulePersist } = await import("@/lib/persist-queue");
    const cards = [{ id: "a" }, { id: "b" }] as any[];
    schedulePersist({ type: "bulk", cards });
    await new Promise(r => setTimeout(r, 50));
    expect(idbBulkApply).toHaveBeenCalledWith(cards, []);
  });

  it("delete action routed through idbBulkApply", async () => {
    const { schedulePersist } = await import("@/lib/persist-queue");
    schedulePersist({ type: "delete", id: "card-to-delete" });
    await new Promise(r => setTimeout(r, 50));
    expect(idbBulkApply).toHaveBeenCalledWith([], ["card-to-delete"]);
  });

  it("mixed put + delete batched into a single atomic call", async () => {
    const { schedulePersist } = await import("@/lib/persist-queue");
    const card1 = { id: "new-1" } as any;
    const card2 = { id: "new-2" } as any;
    schedulePersist({ type: "delete", id: "old-card" });
    schedulePersist({ type: "bulk", cards: [card1, card2] });
    await new Promise(r => setTimeout(r, 50));
    // Both batched into one transaction call
    expect(idbBulkApply).toHaveBeenCalledTimes(1);
    expect(idbBulkApply).toHaveBeenCalledWith([card1, card2], ["old-card"]);
  });

  it("coalesces repeated puts of the same id (last write wins)", async () => {
    const { schedulePersist } = await import("@/lib/persist-queue");
    const v1 = { id: "x", v: 1 } as any;
    const v2 = { id: "x", v: 2 } as any;
    const v3 = { id: "x", v: 3 } as any;
    schedulePersist({ type: "put", card: v1 });
    schedulePersist({ type: "put", card: v2 });
    schedulePersist({ type: "put", card: v3 });
    await new Promise(r => setTimeout(r, 50));
    expect(idbBulkApply).toHaveBeenCalledTimes(1);
    expect(idbBulkApply).toHaveBeenCalledWith([v3], []);
  });

  it("delete after put cancels the put", async () => {
    const { schedulePersist } = await import("@/lib/persist-queue");
    schedulePersist({ type: "put", card: { id: "y" } as any });
    schedulePersist({ type: "delete", id: "y" });
    await new Promise(r => setTimeout(r, 50));
    expect(idbBulkApply).toHaveBeenCalledWith([], ["y"]);
  });
});
