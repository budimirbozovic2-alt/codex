/**
 * Backward-compat shim — the planner module was decomposed into `./planner/*`.
 * Existing imports (`@/lib/planner-storage`) continue to work unchanged.
 * See `./planner/index.ts` for the responsibility map.
 */
export * from "./planner";
