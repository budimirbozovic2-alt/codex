import { describe, expect, it, afterEach } from "vitest";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { DEFAULT_CONFIG } from "@/domains/planner";
import {
  getPlannerConfigFromCache,
  initPlannerQueryCache,
  resetPlannerQueryCache,
  seedPlannerConfig,
} from "@/lib/query/planner-cache-coordinator";
import {
  readPref,
  resetPrefsQueryCache,
  writePref,
} from "@/lib/query/prefs-cache-coordinator";

describe("planner-cache-coordinator", () => {
  afterEach(() => {
    resetPlannerQueryCache();
  });

  it("seedPlannerConfig is read back via getPlannerConfigFromCache", () => {
    const cfg = { ...DEFAULT_CONFIG, dailyAvailableMinutes: 99 };
    seedPlannerConfig(cfg);
    expect(getPlannerConfigFromCache().dailyAvailableMinutes).toBe(99);
    expect(queryClient.getQueryData(queryKeys.planner.config())).toEqual(cfg);
  });
});

describe("prefs-cache-coordinator", () => {
  afterEach(() => {
    resetPrefsQueryCache();
  });

  it("writePref seeds TanStack without localStorage", () => {
    writePref("test-pref", { a: 1 });
    expect(readPref("test-pref", { a: 0 })).toEqual({ a: 1 });
    expect(queryClient.getQueryData(queryKeys.prefs.byKey("test-pref"))).toEqual({ a: 1 });
  });
});
