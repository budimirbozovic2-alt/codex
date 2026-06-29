import { describe, it, expect, vi, beforeEach } from "vitest";

import type { QueryClient } from "@tanstack/react-query";

import {

  invalidateCardsCacheScopes,

  keysForCardsScope,

} from "@/lib/query/cards-invalidation";

import { queryKeys } from "@/lib/query/keys";



describe("cards-invalidation (TD-ARCH-3)", () => {

  let invalidateSpy: ReturnType<typeof vi.fn>;



  beforeEach(() => {

    invalidateSpy = vi.fn().mockResolvedValue(undefined);

  });



  it("maps category scope to expected query keys", () => {

    const keys = keysForCardsScope({ kind: "category", categoryId: "cat-1" });

    expect(keys).toContainEqual(queryKeys.cards.all());

    expect(keys).toContainEqual(queryKeys.cards.byCategory("cat-1"));

  });



  it("invalidates prefix immediately for kind=all", () => {

    const qc = { invalidateQueries: invalidateSpy } as unknown as QueryClient;

    invalidateCardsCacheScopes({ kind: "all" }, qc);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["cards"] });

  });



  it("invalidates derived queries with predicate for kind=derived", () => {

    const qc = { invalidateQueries: invalidateSpy } as unknown as QueryClient;

    invalidateCardsCacheScopes({ kind: "derived" }, qc);

    expect(invalidateSpy).toHaveBeenCalledWith(

      expect.objectContaining({

        queryKey: queryKeys.cards.root,

        predicate: expect.any(Function),

      }),

    );

  });

});


