import { describe, expect, it, vi, afterEach } from "vitest";
import {
  canUseMainSqliteBackend,
  resolveSqliteBackend,
} from "@/lib/persistence/sqlite/backend";

describe("resolveSqliteBackend (Faza 5.3)", () => {
  it("always returns main", () => {
    expect(resolveSqliteBackend()).toBe("main");
  });
});

describe("canUseMainSqliteBackend", () => {
  afterEach(() => {
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
  });

  it("is false without electronAPI", () => {
    expect(canUseMainSqliteBackend()).toBe(false);
  });

  it("is false when sqliteRpc is missing", () => {
    (window as Window & { electronAPI?: { sqliteRpc?: unknown } }).electronAPI =
      {};
    expect(canUseMainSqliteBackend()).toBe(false);
  });

  it("is true when sqliteRpc is exposed", () => {
    (window as Window & { electronAPI?: { sqliteRpc?: unknown } }).electronAPI =
      { sqliteRpc: vi.fn() };
    expect(canUseMainSqliteBackend()).toBe(true);
  });
});
