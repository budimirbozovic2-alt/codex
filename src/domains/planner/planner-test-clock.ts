import { afterAll, beforeAll, vi } from "vitest";

/** Pinned instant so date-boundary planner math stays deterministic in CI. */
export const FIXED_NOW = new Date("2026-06-15T12:00:00.000Z");

export function installFixedPlannerClock(): void {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FIXED_NOW);
  });
  afterAll(() => {
    vi.useRealTimers();
  });
}
