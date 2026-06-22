import { beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import {
  getTestSqlExecutor,
  resetTestSqliteState,
} from "./sqlite-harness";
import { __resetSqliteReadyForTests } from "@/lib/persistence/sqlite/readyMachine";
import { __resetExecutorTelemetry } from "@/lib/db/queries/_shared/executor-telemetry";
import { resetCardsQueryCache } from "@/lib/query/cards-cache-coordinator";
import { resetCategoriesQueryCache } from "@/lib/query/categories-cache-coordinator";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";

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

/** Node 24+ may run vitest without a localStorage implementation. */
function installLocalStoragePolyfill(): void {
  if (typeof globalThis.localStorage !== "undefined" && globalThis.localStorage) {
    return;
  }
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: mock,
    writable: true,
    configurable: true,
  });
}

installLocalStoragePolyfill();

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
  getSqliteExecutor: (...args: unknown[]) =>
    mockGetOpfsSqliteExecutor(...args),
  getOpfsSqliteExecutor: (...args: unknown[]) =>
    mockGetOpfsSqliteExecutor(...args),
  runInTransaction: (...args: unknown[]) => mockRunInTransaction(...args),
  runWithSqlExecutor: async <T>(
    _exec: SqlExecutor,
    fn: () => Promise<T>,
  ): Promise<T> => fn(),
}));

beforeEach(() => {
  resetTestSqliteState();
  __resetSqliteReadyForTests();
  __resetExecutorTelemetry();
  resetCardsQueryCache();
  resetCategoriesQueryCache();
  queryClient.removeQueries({ queryKey: queryKeys.review.root });
  queryClient.removeQueries({ queryKey: queryKeys.settings.root });
  if (typeof localStorage !== "undefined" && localStorage) {
    localStorage.removeItem("sr-app-settings");
  }
  mockGetOpfsSqliteExecutor.mockImplementation(() =>
    Promise.resolve(getTestSqlExecutor()),
  );
});
