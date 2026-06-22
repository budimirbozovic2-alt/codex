import { describe, expect, it, vi, afterEach } from "vitest";
import { makeCard } from "@/test/factories";
import * as dbQueries from "@/lib/db/queries";
import {
  beginCardsWrite,
  commitCardsWriteFromDb,
  resetCardsQueryCache,
} from "@/lib/query/cards-cache-coordinator";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { notifyCardsChanged } from "@/lib/db/queries";

describe("cards authoritative write", () => {
  afterEach(() => {
    resetCardsQueryCache();
    vi.restoreAllMocks();
  });

  it("bulkPutCardsDirect with skipNotify + commitFromDb seeds without prefix invalidate", async () => {
    const card = makeCard({ id: "auth-1" });
    vi.spyOn(dbQueries, "listAllCards").mockResolvedValue([card]);
    vi.spyOn(dbQueries, "countAllCards").mockResolvedValue(1);
    const notifySpy = vi.spyOn(dbQueries, "notifyCardsChanged");

    const gen = beginCardsWrite();
    await dbQueries.bulkPutCardsDirect([card], { skipNotify: true });
    const count = await commitCardsWriteFromDb(gen);

    expect(count).toBe(1);
    expect(queryClient.getQueryData(queryKeys.cards.all())).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "auth-1" })]),
    );
    expect(notifySpy).toHaveBeenCalledWith({ kind: "derived" });
    expect(notifySpy).not.toHaveBeenCalledWith({ kind: "all" });
  });
});
