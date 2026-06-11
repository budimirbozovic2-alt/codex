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

// PR-H7 Fix: Tiptap V4 viewport tracking zahtijeva
// elementFromPoint metodu koju JSDOM nativno nema.
if (typeof document !== "undefined") {
  document.elementFromPoint = () => null;
}

// ─── A1c-4 F5: SQLite test harness ────────────────────────────────
vi.mock("@/lib/electron-integration", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/electron-integration")
  >("@/lib/electron-integration");
  return {
    ...actual,
    isElectron: () => true,
    assertDesktop: () => {},
  };
});

vi.mock("@/lib/persistence/sqlite/client", async () => {
  const { __resetSqliteReadyForTests } = await import(
    "@/lib/persistence/sqlite/readyMachine"
  );
  return {
    getOpfsSqliteExecutor: async () => getTestSqlExecutor(),
    __resetSqliteClient: () => __resetSqliteReadyForTests(),
    runInTransaction: async <T>(cb: (exec: ReturnType<typeof getTestSqlExecutor>) => Promise<T>) =>
      getTestSqlExecutor().transaction(cb),
  };
});

beforeEach(() => {
  resetTestSqliteState();
});