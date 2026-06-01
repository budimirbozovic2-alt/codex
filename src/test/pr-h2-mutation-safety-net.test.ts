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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 1. saveDisciplineLog rollback ────────────────────────────────────────
describe("PR-H2 #1 — saveDisciplineLog rollback on persist failure", () => {
  beforeEach(() => { vi.resetModules(); });

  it("restores previous disciplineCache snapshot and rethrows when SQLite write fails", async () => {
    vi.doMock("@/lib/db/queries", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/db/queries")>();
      return {
        ...actual,
        // discipline.ts imports the SQLite write under the alias
        // `savePlannerDisciplineLog` — that is the symbol we must override.
        savePlannerDisciplineLog: vi.fn(async () => {
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
    expect(disciplineCache.get()).toEqual(baseline);
  });
});

// ── 2. deleteSourceAndUnlinkCards source-code guard ──────────────────────
describe("PR-H2 #2 — deleteSourceAndUnlinkCards catch-branch nulls FK", () => {
  it("contains a column-only UPDATE … SET sourceId = NULL fallback inside the catch branch", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/db/queries/sources.ts"), "utf8");
    // Static guard: presence of the column-only UPDATE and clearedIds.push
    // OUTSIDE the try block (i.e. after the closing `}` of catch).
    expect(src).toMatch(/UPDATE cards SET sourceId = NULL WHERE id = \?/);
    // Ensure the push isn't trapped inside the try.
    const fn = src.slice(src.indexOf("export async function deleteSourceAndUnlinkCards"));
    const tryIdx = fn.indexOf("try {");
    const catchIdx = fn.indexOf("} catch (err)", tryIdx);
    const closeCatchIdx = fn.indexOf("}", fn.indexOf("{", catchIdx) + 1);
    const pushIdx = fn.indexOf("clearedIds.push(row.id)");
    expect(pushIdx).toBeGreaterThan(closeCatchIdx);
  });
});

// ── 3. saveReviewSession rethrows ────────────────────────────────────────
describe("PR-H2 #3 — saveReviewSession rethrows on persist failure", () => {
  beforeEach(() => { vi.resetModules(); });

  it("propagates the error instead of swallowing at debug level", async () => {
    vi.doMock("@/lib/db/queries", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/db/queries")>();
      return {
        ...actual,
        putSetting: vi.fn(async () => { throw new Error("DISK_FULL"); }),
      };
    });

    const { saveReviewSession } = await import("@/lib/review-session-storage");
    await expect(
      saveReviewSession({ mode: "critical", randomIndex: 0, timestamp: Date.now() }),
    ).rejects.toThrow(/DISK_FULL/);
  });
});

// ── 4. useSourceMutations onSettled safety net ───────────────────────────
describe("PR-H2 #4 — useSourceMutations has bridge-detached safety net", () => {
  it("save and remove mutations both define onSettled invalidations", () => {
    const src = readFileSync(resolve(process.cwd(), "src/hooks/source/useSourceMutations.ts"), "utf8");
    const onSettledCount = (src.match(/onSettled:\s*\(/g) ?? []).length;
    expect(onSettledCount).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/queryKeys\.sources\.byCategory\(/);
    expect(src).toMatch(/invalidateQueries\(\{\s*queryKey:\s*queryKeys\.sources\.all\(\)/);
  });
});
