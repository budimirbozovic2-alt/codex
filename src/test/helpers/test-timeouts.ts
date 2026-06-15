/**
 * TD-1 — Shared timeout budgets for perf/integration describes.
 *
 * Default vitest `testTimeout` stays at 10s (see vitest.config.ts). Only
 * describes that legitimately exceed that budget under CI load should import
 * these constants via `describe.configure({ timeout: … })`.
 */
export const SLOW_TEST_TIMEOUT_MS = 30_000;
export const INTEGRATION_TEST_TIMEOUT_MS = 20_000;
