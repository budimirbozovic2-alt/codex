/**
 * PR-H2 — Regression guards za optimističku mutation safety-net.
 *
 *   1. `saveDisciplineLog` rethrowa i vraća `disciplineCache` na prethodni
 *      snapshot kad SQLite write padne. Bez ovog fix-a RAM cache je tiho
 *      divergirao od diska.
 *   2. `deleteSourceAndUnlinkCards` u catch-grani re-encode-a još uvijek
 *      NULL-uje FK kolonu I uključuje karticu u `clearedIds` — inače
 *      embedded JSON `sourceId` ostaje da curi nakon DELETE-a izvora.
 *   3. `saveReviewSession` rethrowa kad putSetting padne (raniji silent
 *      `logger.debug` swallow je pretvoren u toast u ReviewSession).
 *   4. `useSourceMutations` ima `onSettled` safety-net invalidaciju za
 *      slučaj da bridge listener prekrije HMR/tear-down.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── 1. saveDisciplineLog rollback ────────────────────────────────────────
describe("PR-H2 #1 — saveDisciplineLog rollback on persist failure", () => {
  beforeEach(() => { vi.resetModules(); });

  it("restores previous disciplineCache snapshot and rethrows when SQLite write fails", async () => {
    vi.doMock("@/lib/db/queries", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/db/queries")>();
      return {
        ...actual,
        // The domain module imports this re-export name.
        saveDisciplineLog: vi.fn(async () => {
          throw new Error("SQLITE_BUSY");
        }),
      };
    });

    const { saveDisciplineLog } = await import("@/domains/planner/discipline");
    const { disciplineCache } = await import("@/domains/planner/cache");

    const baseline = [{ date: "2026-05-30", status: "diligent" as const, planCompletion: 100, slippageMs: 0, reviewsDone: 10, suggestedReviews: 10 }];
    disciplineCache.set(baseline);

    const next = [...baseline, { date: "2026-05-31", status: "lazy" as const, planCompletion: 40, slippageMs: 600_000, reviewsDone: 4, suggestedReviews: 10 }];

    await expect(saveDisciplineLog(next)).rejects.toThrow(/SQLITE_BUSY/);
    // Cache must be back to baseline, not the failed optimistic write.
    expect(disciplineCache.get()).toEqual(baseline);
  });
});

// ── 2. deleteSourceAndUnlinkCards catch-grana ────────────────────────────
describe("PR-H2 #2 — deleteSourceAndUnlinkCards still nulls FK on payload parse failure", () => {
  it("issues UPDATE … SET sourceId = NULL and reports the card id even when JSON.parse throws", async () => {
    const runMock = vi.fn(async () => undefined);
    const allMock = vi.fn(async () => [
      { id: "card-good", payload: JSON.stringify({ id: "card-good", sourceId: "src-1" }) },
      { id: "card-bad", payload: "{not json" },
    ]);
    const txMock = vi.fn(async (fn: (tx: { run: typeof runMock; all: typeof allMock }) => Promise<void>) => {
      await fn({ run: runMock, all: allMock });
    });
    const exec = { transaction: txMock };

    vi.resetModules();
    vi.doMock("@/lib/persistence/sqlite/executor-registry", () => ({
      requireExecutor: async () => exec,
    }));

    const { deleteSourceAndUnlinkCards } = await import("@/lib/db/queries/sources");
    const cleared = await deleteSourceAndUnlinkCards("src-1");

    expect(cleared).toEqual(expect.arrayContaining(["card-good", "card-bad"]));
    // The bad card got the column-only UPDATE.
    const sawColumnOnlyUpdate = runMock.mock.calls.some((call) => {
      const sql = call[0] as unknown;
      const params = call[1] as unknown;
      return (
        typeof sql === "string" &&
        sql.includes("UPDATE cards SET sourceId = NULL WHERE id = ?") &&
        Array.isArray(params) && params[0] === "card-bad"
      );
    });
    expect(sawColumnOnlyUpdate).toBe(true);
  });
});

// ── 3. saveReviewSession rethrows ────────────────────────────────────────
describe("PR-H2 #3 — saveReviewSession rethrows on persist failure", () => {
  it("propagates the error instead of swallowing at debug level", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/queries", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/db/queries")>();
      return {
        ...actual,
        putSetting: vi.fn(async () => { throw new Error("DISK_FULL"); }),
      };
    });

    const { saveReviewSession } = await import("@/lib/review-session-storage");
    await expect(
      saveReviewSession({ mode: "due", randomIndex: 0, timestamp: Date.now() }),
    ).rejects.toThrow(/DISK_FULL/);
  });
});

// ── 4. useSourceMutations onSettled safety net ───────────────────────────
describe("PR-H2 #4 — useSourceMutations has bridge-detached safety net", () => {
  it("save mutation defines onSettled that invalidates the scoped sources queries", async () => {
    // Pure source-level guard: we assert the mutation factory wires
    // `onSettled` so a missed bridge event can't leave optimistic state
    // sticking around. Behavioural coverage (renderHook + waitFor) lives
    // in cards-e2e; here we keep the test cheap and dependency-free.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      new URL("../hooks/source/useSourceMutations.ts", import.meta.url),
      "utf8",
    );
    // Both `save` and `remove` mutations must define onSettled.
    const onSettledCount = (src.match(/onSettled:\s*\(/g) ?? []).length;
    expect(onSettledCount).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/queryKeys\.sources\.byCategory\(/);
  });
});
