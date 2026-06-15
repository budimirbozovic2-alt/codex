import { beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import {
  getTestSqlExecutor,
  resetTestSqliteState,
} from "./sqlite-harness";
import { __resetSqliteReadyForTests } from "@/lib/persistence/sqlite/readyMachine";
import { __resetExecutorTelemetry } from "@/lib/db/queries/_shared/executor-telemetry";

/**
 * jsdom does not implement document hit-testing APIs. ProseMirror (posAtCoords)
 * and TipTap Placeholder viewport tracking call elementFromPoint during mount.
 * A no-op stub lets ProseMirror fall back to its DOM-walking path; Placeholder
 * then uses pos 0..doc.size when coords resolve to null.
 */
function installDomHitTestingPolyfills(): void {
  if (typeof document.elementFromPoint !== "function") {
    document.elementFromPoint = () => null;
  }
  if (typeof document.elementsFromPoint !== "function") {
    document.elementsFromPoint = () => [];
  }
}

installDomHitTestingPolyfills();

const mockGetOpfsSqliteExecutor = vi.hoisted(() =>
  vi.fn<[], Promise<SqlExecutor>>(),
);

const mockRunInTransaction = vi.hoisted(() =>
  vi.fn(
    async <T>(cb: (executor: SqlExecutor) => Promise<T>): Promise<T> => {
      const executor = getTestSqlExecutor();
      return executor.transaction(cb);
    },
  ),
);

vi.mock("@/lib/electron-integration", () => ({
  isElectron: () => true,
  assertDesktop: () => {},
  setupElectronIPC: vi.fn(async () => () => {}),
}));

vi.mock("@/lib/persistence/sqlite/client", () => ({
  getOpfsSqliteExecutor: (...args: unknown[]) =>
    mockGetOpfsSqliteExecutor(...args),
  runInTransaction: (...args: unknown[]) => mockRunInTransaction(...args),
}));

beforeEach(() => {
  resetTestSqliteState();
  __resetSqliteReadyForTests();
  __resetExecutorTelemetry();
  localStorage.removeItem("sr-app-settings");
  mockGetOpfsSqliteExecutor.mockImplementation(() =>
    Promise.resolve(getTestSqlExecutor()),
  );
});
