import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the repository BEFORE importing the bus so the bus binds to the spy.
const repoCalls: string[] = [];
let resolveSlow: (() => void) | null = null;

vi.mock("@/lib/repositories/cardRepository", () => {
  const cardRepository = {
    get: vi.fn(),
    snapshot: vi.fn(() => ({})),
    put: vi.fn((card: { id: string }) => { repoCalls.push(`put:${card.id}`); }),
    bulkPut: vi.fn((cards: { id: string }[]) => {
      repoCalls.push(`bulkPut:${cards.map((c) => c.id).join(",")}`);
    }),
    remove: vi.fn((id: string) => { repoCalls.push(`del:${id}`); }),
    patch: vi.fn((id: string) => { repoCalls.push(`patch:${id}`); return undefined; }),
    bulkPatch: vi.fn((ids: string[]) => {
      repoCalls.push(`bulkPatch:${ids.join(",")}`);
      return [];
    }),
    clearLinks: vi.fn((ids: string[]) => {
      repoCalls.push(`clearLinks:${ids.join(",")}`);
      return [];
    }),
    clearNeedsReview: vi.fn((id: string) => {
      repoCalls.push(`clearNeedsReview:${id}`);
      return undefined;
    }),
    applySyncDelta: vi.fn((rows: { id: string }[], dels: string[]) => {
      repoCalls.push(`sync:${rows.map((r) => r.id).join(",")}|${dels.join(",")}`);
    }),
    replaceAll: vi.fn(() => { repoCalls.push("replaceAll"); }),
  };
  return { cardRepository };
});

import { cardCommandBus } from "@/lib/repositories/cardCommandBus";
import type { Card } from "@/lib/spaced-repetition";

const card = (id: string): Card => ({ id } as unknown as Card);

beforeEach(() => {
  repoCalls.length = 0;
  resolveSlow = null;
});

describe("cardCommandBus — per-id mutex", () => {
  it("serializes commands targeting the same id in FIFO order", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => i);
    await Promise.all(
      ids.map((i) =>
        cardCommandBus.dispatch({ type: "patch", id: "x", patcher: (c) => ({ ...c, n: i } as Card) }),
      ),
    );
    expect(repoCalls).toEqual(ids.map(() => "patch:x"));
    expect(repoCalls).toHaveLength(20);
  });

  it("does not block independent ids", async () => {
    await Promise.all([
      cardCommandBus.dispatch({ type: "put", card: card("a") }),
      cardCommandBus.dispatch({ type: "put", card: card("b") }),
      cardCommandBus.dispatch({ type: "put", card: card("c") }),
    ]);
    expect(new Set(repoCalls)).toEqual(new Set(["put:a", "put:b", "put:c"]));
  });

  it("acquires multi-id locks deterministically (no deadlock with overlap)", async () => {
    const a = cardCommandBus.dispatch({
      type: "bulkPatch",
      ids: ["x", "y"],
      patcher: (c) => c,
    });
    const b = cardCommandBus.dispatch({
      type: "bulkPatch",
      ids: ["y", "z"],
      patcher: (c) => c,
    });
    await Promise.all([a, b]);
    expect(repoCalls).toEqual(["bulkPatch:x,y", "bulkPatch:y,z"]);
  });

  it("applySyncDelta after patch on overlapping id runs strictly after", async () => {
    const p = cardCommandBus.dispatch({ type: "patch", id: "shared", patcher: (c) => c });
    const s = cardCommandBus.dispatch({
      type: "applySyncDelta",
      rows: [card("shared")],
      deletedIds: [],
    });
    await Promise.all([p, s]);
    expect(repoCalls).toEqual(["patch:shared", "sync:shared|"]);
  });

  it("replaceAll waits for every pending per-id chain (global lock)", async () => {
    const order: string[] = [];
    // Start two per-id commands, then a replaceAll. replaceAll must run last.
    const p1 = cardCommandBus
      .dispatch({ type: "patch", id: "a", patcher: (c) => c })
      .then(() => order.push("a"));
    const p2 = cardCommandBus
      .dispatch({ type: "patch", id: "b", patcher: (c) => c })
      .then(() => order.push("b"));
    const r = cardCommandBus
      .dispatch({ type: "replaceAll", map: {} })
      .then(() => order.push("replaceAll"));
    await Promise.all([p1, p2, r]);
    expect(order[order.length - 1]).toBe("replaceAll");
  });

  it("commands AFTER replaceAll wait for it (global gate)", async () => {
    const r = cardCommandBus.dispatch({ type: "replaceAll", map: {} });
    const after = cardCommandBus.dispatch({ type: "patch", id: "a", patcher: (c) => c });
    await Promise.all([r, after]);
    expect(repoCalls).toEqual(["replaceAll", "patch:a"]);
  });

  it("drain() resolves only when chain is idle", async () => {
    const dispatches = [
      cardCommandBus.dispatch({ type: "patch", id: "a", patcher: (c) => c }),
      cardCommandBus.dispatch({ type: "patch", id: "a", patcher: (c) => c }),
      cardCommandBus.dispatch({ type: "patch", id: "b", patcher: (c) => c }),
    ];
    await cardCommandBus.drain();
    expect(repoCalls.filter((c) => c.startsWith("patch:"))).toHaveLength(3);
    await Promise.all(dispatches);
  });
});

void resolveSlow; // suppress unused
