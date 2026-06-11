// cardRepository — write gateway tests
import { describe, it, expect, beforeEach } from "vitest";
import type { Card } from "@/lib/spaced-repetition";
import { cardRepository } from "@/lib/repositories";
import { listAllCards, onCardsChanged } from "@/lib/db/queries";

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    question: `Q-${id}`,
    sections: [],
    categoryId: "cat-test",
    createdAt: 1_000_000,
    type: "essay",
    ...overrides,
  } as Card;
}

describe("cardRepository", () => {
  beforeEach(() => {
    // resetTestSqliteState is called globally via setup.ts beforeEach
  });

  // ── put ──────────────────────────────────────────────────────────────────

  it("put writes a card to SQLite and returns it", async () => {
    const card = makeCard("put-1", { updatedAt: 9999 });
    const result = await cardRepository.put(card);
    expect(result.id).toBe("put-1");
    const all = await listAllCards();
    expect(all.some((c) => c.id === "put-1")).toBe(true);
  });

  it("put stamps updatedAt when absent", async () => {
    const before = Date.now();
    const result = await cardRepository.put(makeCard("put-stamp"));
    expect(result.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("put notifies cards-changed once", async () => {
    let count = 0;
    const unsub = onCardsChanged(() => count++);
    await cardRepository.put(makeCard("put-notify"));
    unsub();
    expect(count).toBe(1);
  });

  it("put upserts an existing card (INSERT OR REPLACE)", async () => {
    await cardRepository.put(makeCard("put-upsert", { question: "v1" }));
    await cardRepository.put(makeCard("put-upsert", { question: "v2", updatedAt: Date.now() }));
    const all = await listAllCards();
    const match = all.filter((c) => c.id === "put-upsert");
    expect(match).toHaveLength(1);
    expect(match[0].question).toBe("v2");
  });

  // ── remove ───────────────────────────────────────────────────────────────

  it("remove deletes the card row from SQLite", async () => {
    await cardRepository.put(makeCard("rm-1"));
    await cardRepository.remove("rm-1");
    const all = await listAllCards();
    expect(all.some((c) => c.id === "rm-1")).toBe(false);
  });

  it("remove notifies cards-changed", async () => {
    await cardRepository.put(makeCard("rm-notify"));
    let count = 0;
    const unsub = onCardsChanged(() => count++);
    await cardRepository.remove("rm-notify");
    unsub();
    expect(count).toBe(1);
  });

  it("remove is idempotent for non-existent ids", async () => {
    await expect(cardRepository.remove("does-not-exist")).resolves.toBeUndefined();
  });

  // ── bulkPut ──────────────────────────────────────────────────────────────

  it("bulkPut writes all cards atomically", async () => {
    const cards = [makeCard("bp-1"), makeCard("bp-2"), makeCard("bp-3")];
    const result = await cardRepository.bulkPut(cards);
    expect(result).toHaveLength(3);
    const all = await listAllCards();
    const ids = all.map((c) => c.id);
    expect(ids).toContain("bp-1");
    expect(ids).toContain("bp-2");
    expect(ids).toContain("bp-3");
  });

  it("bulkPut stamps updatedAt on cards that lack it", async () => {
    const before = Date.now();
    const [c1, c2] = await cardRepository.bulkPut([makeCard("bps-1"), makeCard("bps-2")]);
    expect(c1.updatedAt).toBeGreaterThanOrEqual(before);
    expect(c2.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("bulkPut notifies once even for a large batch", async () => {
    let count = 0;
    const unsub = onCardsChanged(() => count++);
    await cardRepository.bulkPut([makeCard("bpn-1"), makeCard("bpn-2"), makeCard("bpn-3")]);
    unsub();
    expect(count).toBe(1);
  });

  it("bulkPut with empty array returns empty and does not notify", async () => {
    let count = 0;
    const unsub = onCardsChanged(() => count++);
    const result = await cardRepository.bulkPut([]);
    unsub();
    expect(result).toHaveLength(0);
    expect(count).toBe(0);
  });

  // ── patch ────────────────────────────────────────────────────────────────

  it("patch reads from SQLite, applies patcher, writes back atomically", async () => {
    await cardRepository.put(makeCard("patch-1", { question: "original" }));
    const result = await cardRepository.patch("patch-1", (c) => ({ ...c, question: "patched" }));
    expect(result?.question).toBe("patched");
    expect(result?.updatedAt).toBeGreaterThan(0);
    const all = await listAllCards();
    expect(all.find((c) => c.id === "patch-1")?.question).toBe("patched");
  });

  it("patch stamps updatedAt on every call", async () => {
    await cardRepository.put(makeCard("patch-stamp", { updatedAt: 1 }));
    const before = Date.now();
    const result = await cardRepository.patch("patch-stamp", (c) => c);
    expect(result?.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("patch returns undefined for non-existent card and does not notify", async () => {
    let count = 0;
    const unsub = onCardsChanged(() => count++);
    const result = await cardRepository.patch("no-such-id", (c) => c);
    unsub();
    expect(result).toBeUndefined();
    expect(count).toBe(0);
  });

  it("patch notifies once on success", async () => {
    await cardRepository.put(makeCard("patch-notify"));
    let count = 0;
    const unsub = onCardsChanged(() => count++);
    await cardRepository.patch("patch-notify", (c) => ({ ...c, question: "updated" }));
    unsub();
    expect(count).toBe(1);
  });

  // ── bulkPatch ────────────────────────────────────────────────────────────

  it("bulkPatch reads from SQLite (not cache) and writes all rows atomically", async () => {
    await cardRepository.put(makeCard("bkp-1", { question: "q1" }));
    await cardRepository.put(makeCard("bkp-2", { question: "q2" }));
    const result = await cardRepository.bulkPatch(["bkp-1", "bkp-2"], (c) => ({
      ...c,
      question: c.question + "-updated",
    }));
    expect(result).toHaveLength(2);
    const all = await listAllCards();
    expect(all.find((c) => c.id === "bkp-1")?.question).toBe("q1-updated");
    expect(all.find((c) => c.id === "bkp-2")?.question).toBe("q2-updated");
  });

  it("bulkPatch stamps updatedAt with a consistent timestamp across all rows", async () => {
    await cardRepository.put(makeCard("bkp-ts-1", { updatedAt: 1 }));
    await cardRepository.put(makeCard("bkp-ts-2", { updatedAt: 1 }));
    const before = Date.now();
    const result = await cardRepository.bulkPatch(["bkp-ts-1", "bkp-ts-2"], (c) => c);
    for (const r of result) {
      expect(r.updatedAt).toBeGreaterThanOrEqual(before);
    }
  });

  it("bulkPatch skips ids not found in SQLite", async () => {
    await cardRepository.put(makeCard("bkp-miss-1", { question: "real" }));
    const result = await cardRepository.bulkPatch(
      ["bkp-miss-1", "ghost-id"],
      (c) => ({ ...c, question: "updated" }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("bkp-miss-1");
  });

  it("bulkPatch with empty ids returns empty and does not notify", async () => {
    let count = 0;
    const unsub = onCardsChanged(() => count++);
    const result = await cardRepository.bulkPatch([], (c) => c);
    unsub();
    expect(result).toHaveLength(0);
    expect(count).toBe(0);
  });

  it("bulkPatch notifies once even for multiple rows", async () => {
    await cardRepository.put(makeCard("bkpn-1"));
    await cardRepository.put(makeCard("bkpn-2"));
    let count = 0;
    const unsub = onCardsChanged(() => count++);
    await cardRepository.bulkPatch(["bkpn-1", "bkpn-2"], (c) => c);
    unsub();
    expect(count).toBe(1);
  });
});
