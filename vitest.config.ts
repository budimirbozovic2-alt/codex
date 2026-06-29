import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { jsdomTsTestGlobs } from "./src/test/jsdom-environment-globs";

export default defineConfig({
  plugins: [react()],
  test: {
    // Pure unit tests default to node (~5× faster env startup than jsdom).
    environment: "node",
    environmentMatchGlobs: [
      ["**/*.{test,spec}.tsx", "jsdom"],
      ...jsdomTsTestGlobs.map((glob) => [glob, "jsdom"] as const),
    ],
    globals: true,
    setupFiles: ["./src/test/setup-dom.ts", "./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // PR-G7: enforce test isolation. Stubs/mocks created with vi.fn()/vi.spyOn()
    // are cleared (call history) and restored (original implementations) between
    // tests so leaked mocks from one test cannot bleed into another and mask
    // regressions (root-cause RC-7: tooling guardrails).
    clearMocks: true,
    restoreMocks: true,
    mockReset: false,
    // ── RC-8 / TD-1: Test execution guarantees ─────────────────────────────
    // Default 10s keeps fast feedback. Perf/integration describes opt into
    // 20–30s via `describe(..., { timeout })` + `src/test/helpers/test-timeouts.ts`.
    testTimeout: 10000,
    hookTimeout: 15000,
    // Run tests sequentially within each file to avoid race conditions in
    // shared state (e.g., SQLite in-memory harness, event emitters).
    // Vitest 3.x isolates per file by default; this ensures stability.
    singleThread: false,
    // Increase reporters verbosity to catch early failures.
    reporters: ["verbose"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
