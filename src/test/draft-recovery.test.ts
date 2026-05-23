import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db-schema";
import { recoverDraftsOnBoot } from "@/lib/drafts/draftRecovery";

vi.mock("sonner", () => ({ toast: vi.fn() }));
import { toast } from "sonner";

beforeEach(async () => {
  await db.drafts.clear();
  vi.clearAllMocks();
  // Reset the module-level `scanRan` flag by reloading via dynamic import is
  // not trivial; instead each test asserts only the IDB side effects and lets
  // the toast assertion check the first call.
});

describe("draftRecovery — boot scan", () => {
  it("deletes stale rows (>7d) and keeps fresh ones", async () => {
    const now = Date.now();
    const stale = now - 10 * 24 * 60 * 60 * 1000;
    const fresh = now - 60 * 1000;
    await db.drafts.bulkPut([
      { key: "article:stale", source: "zettelkasten-article", payload: {}, updatedAt: stale },
      { key: "article:fresh", source: "zettelkasten-article", payload: {}, updatedAt: fresh },
    ]);

    await recoverDraftsOnBoot();

    const remaining = await db.drafts.toArray();
    expect(remaining.map(r => r.key).sort()).toEqual(["article:fresh"]);
    expect(toast).toHaveBeenCalledTimes(1);
    const description = (toast as ReturnType<typeof vi.fn>).mock.calls[0][1]?.description as string;
    expect(description).toContain("članci");
  });

  it("is idempotent — second call is a no-op", async () => {
    // First call already happened in prior test; verify scan guard.
    await db.drafts.put({
      key: "x:1", source: "card-form", payload: {}, updatedAt: Date.now(),
    });
    await recoverDraftsOnBoot();
    expect(toast).not.toHaveBeenCalled();
  });
});
