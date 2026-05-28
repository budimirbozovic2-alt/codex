import "@testing-library/jest-dom";
import { vi, beforeEach } from "vitest";
import {
  getTestSqlExecutor,
  resetTestSqliteState,
} from "./sqlite-harness";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// ─── A1c-4 F5: SQLite test harness ────────────────────────────────────────
// Make production repo helpers (`tryGetExecutor` → `isElectron() &&
// getOpfsSqliteExecutor()`) resolve to a deterministic in-memory executor in
// jsdom. Without this, every SQLite-primary reader returns `[]` and SQLite-
// primary writers are no-ops. See src/test/sqlite-harness.ts.

vi.mock("@/lib/electron-integration", async () => {
  const actual = await vi.importActual<typeof import("@/lib/electron-integration")>(
    "@/lib/electron-integration",
  );
  return {
    ...actual,
    isElectron: () => true,
    assertDesktop: () => {},
  };
});

vi.mock("@/lib/persistence/sqlite/client", () => ({
  getOpfsSqliteExecutor: async () => getTestSqlExecutor(),
  __resetSqliteClient: () => {},
}));

beforeEach(() => {
  resetTestSqliteState();
});
