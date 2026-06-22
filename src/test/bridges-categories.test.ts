import { describe, expect, it, afterEach, vi } from "vitest";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { emitDomainChanged } from "@/lib/event-bus";
import {
  _resetBridgesForTest,
  installQueryBridges,
} from "@/lib/query/bridges";

describe("bridges — categories", () => {
  afterEach(() => {
    _resetBridgesForTest();
    vi.restoreAllMocks();
  });

  it("emit categories/all invalidates categories root queries", async () => {
    installQueryBridges(queryClient);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    emitDomainChanged({ domain: "categories", scope: { kind: "all" } });

    await vi.waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.categories.root,
      });
    });
  });
});
