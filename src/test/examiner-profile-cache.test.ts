/**
 * Contract tests for the examiner-profile cache reconciliation logic.
 *
 * Critical invariants:
 *  1. A reprime where a record's `examinerProfile` is `undefined` must
 *     OVERWRITE any previously-cached profile (no stale read).
 *  2. Records absent from the input set are evicted entirely.
 *  3. `hasExaminerProfileEntry` distinguishes "never primed" from
 *     "primed, profile absent".
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { ExaminerProfile } from "@/lib/db-schema";
import {
  _clearExaminerProfileCache,
  getExaminerProfileSync,
  hasExaminerProfileEntry,
  primeExaminerProfilesFromRecords,
} from "@/lib/examiner-profile-cache";

const PROFILE_A: ExaminerProfile = { focusAreas: ["alpha"], style: "strict" } as unknown as ExaminerProfile;

beforeEach(() => {
  _clearExaminerProfileCache();
});

describe("examiner-profile-cache reconciliation", () => {
  it("returns undefined for never-primed categories", () => {
    expect(getExaminerProfileSync("ghost")).toBeUndefined();
    expect(hasExaminerProfileEntry("ghost")).toBe(false);
  });

  it("primes a record's profile and exposes it via the sync getter", () => {
    primeExaminerProfilesFromRecords([{ id: "cat-1", examinerProfile: PROFILE_A }]);
    expect(getExaminerProfileSync("cat-1")).toBe(PROFILE_A);
    expect(hasExaminerProfileEntry("cat-1")).toBe(true);
  });

  it("primed-but-absent record reads as undefined AND is marked as primed", () => {
    primeExaminerProfilesFromRecords([{ id: "cat-1" }]);
    expect(getExaminerProfileSync("cat-1")).toBeUndefined();
    expect(hasExaminerProfileEntry("cat-1")).toBe(true);
  });

  it("reprime with examinerProfile=undefined overwrites a prior profile (no stale read)", () => {
    primeExaminerProfilesFromRecords([{ id: "cat-1", examinerProfile: PROFILE_A }]);
    expect(getExaminerProfileSync("cat-1")).toBe(PROFILE_A);

    // Same id appears in the next prime cycle WITHOUT a profile — must clear.
    primeExaminerProfilesFromRecords([{ id: "cat-1", examinerProfile: undefined }]);
    expect(getExaminerProfileSync("cat-1")).toBeUndefined();
    expect(hasExaminerProfileEntry("cat-1")).toBe(true);
  });

  it("records missing from the new prime are evicted entirely", () => {
    primeExaminerProfilesFromRecords([
      { id: "cat-1", examinerProfile: PROFILE_A },
      { id: "cat-2", examinerProfile: PROFILE_A },
    ]);
    expect(hasExaminerProfileEntry("cat-2")).toBe(true);

    // cat-2 disappears from SSOT (e.g. user deleted the subject).
    primeExaminerProfilesFromRecords([{ id: "cat-1", examinerProfile: PROFILE_A }]);
    expect(hasExaminerProfileEntry("cat-2")).toBe(false);
    expect(getExaminerProfileSync("cat-2")).toBeUndefined();
    // cat-1 is untouched.
    expect(getExaminerProfileSync("cat-1")).toBe(PROFILE_A);
  });

  it("handles an empty records array by evicting everything", () => {
    primeExaminerProfilesFromRecords([{ id: "cat-1", examinerProfile: PROFILE_A }]);
    primeExaminerProfilesFromRecords([]);
    expect(hasExaminerProfileEntry("cat-1")).toBe(false);
    expect(getExaminerProfileSync("cat-1")).toBeUndefined();
  });
});
