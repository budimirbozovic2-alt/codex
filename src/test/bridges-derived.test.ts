import { describe, expect, it, afterEach, vi } from "vitest";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { emitDomainChanged } from "@/lib/event-bus";
import { _resetBridgesForTest, installQueryBridges } from "@/lib/query/bridges";

describe("bridges derived card invalidation", () => {
  beforeEach(() => {
    _resetBridgesForTest();
    installQueryBridges(queryClient);
  });

  afterEach(() => {
    _resetBridgesForTest();
    vi.restoreAllMocks();
  });

  it("derived scope invalidates due/count keys but not seeded all/countAll", async () => {
    installQueryBridges(queryClient);
    queryClient.setQueryData(queryKeys.cards.all(), [{ id: "seed" }]);
    queryClient.setQueryData(queryKeys.cards.countAll(), 1);
    queryClient.setQueryData(queryKeys.cards.countDue(), 3);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    emitDomainChanged({ domain: "cards", scope: { kind: "derived" } });
    await new Promise((r) => setTimeout(r, 25));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.cards.root,
        predicate: expect.any(Function),
      }),
    );

    const call = invalidateSpy.mock.calls.find(
      (c) => typeof c[0]?.predicate === "function",
    );
    const predicate = call?.[0]?.predicate as (q: { queryKey: readonly unknown[] }) => boolean;

    expect(predicate({ queryKey: queryKeys.cards.all() })).toBe(false);
    expect(predicate({ queryKey: queryKeys.cards.countAll() })).toBe(false);
    expect(predicate({ queryKey: queryKeys.cards.countDue() })).toBe(true);
    expect(predicate({ queryKey: queryKeys.cards.byCategory("cat-1") })).toBe(true);
  });
});
