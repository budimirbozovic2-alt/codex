/**
 * Backward-compat shim — the planner domain lives at `@/domains/planner`.
 * Existing imports (`@/lib/planner-storage`) continue to work unchanged.
 * See `src/domains/planner/index.ts` for the responsibility map.
 */
export * from "@/domains/planner";
