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
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
