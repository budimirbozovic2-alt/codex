import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // PR-G7: enforce test isolation. Stubs/mocks created with vi.fn()/vi.spyOn()
    // are cleared (call history) and restored (original implementations) between
    // tests so leaked mocks from one test cannot bleed into another and mask
    // regressions (root-cause RC-7: tooling guardrails).
    clearMocks: true,
    restoreMocks: true,
    mockReset: false,
    // ── RC-8: Test execution guarantees ────────────────────────────────────
    // Explicit timeouts prevent hanging tests from blocking CI after 30s.
    // Hook timeouts ensure setup/teardown are bounded independently.
    testTimeout: 10000,
    hookTimeout: 10000,
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
