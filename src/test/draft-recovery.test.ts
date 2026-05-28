import { describe, it, expect, vi, beforeEach } from "vitest";
import { putDraft, listAllDrafts } from "@/lib/db/queries";
import { recoverDraftsOnBoot } from "@/lib/drafts/draftRecovery";

vi.mock("sonner", () => ({ toast: vi.fn() }));
import { toast } from "sonner";

beforeEach(() => {
  vi.clearAllMocks();
  // Module-level `scanRan` guard isn't reset between tests — the 2nd test
  // intentionally exercises the idempotent path.
});

describe("draftRecovery — boot scan", () => {
  it("deletes stale rows (>7d) and keeps fresh ones", async () => {
    const now = Date.now();
    const stale = now - 10 * 24 * 60 * 60 * 1000;
    const fresh = now - 60 * 1000;
    await putDraft({ key: "article:stale", source: "zettelkasten-article", payload: {}, updatedAt: stale });
    await putDraft({ key: "article:fresh", source: "zettelkasten-article", payload: {}, updatedAt: fresh });

    await recoverDraftsOnBoot();

    const remaining = await listAllDrafts();
    expect(remaining.map(r => r.key).sort()).toEqual(["article:fresh"]);
    expect(toast).toHaveBeenCalledTimes(1);
    const mockToast = toast as unknown as ReturnType<typeof vi.fn>;
    const description = mockToast.mock.calls[0][1]?.description as string;
    expect(description).toContain("članci");
  });

  it("is idempotent — second call is a no-op", async () => {
    await putDraft({ key: "x:1", source: "card-form", payload: {}, updatedAt: Date.now() });
    await recoverDraftsOnBoot();
    expect(toast).not.toHaveBeenCalled();
  });
});
