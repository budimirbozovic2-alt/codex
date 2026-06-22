import { describe, expect, it, vi, beforeEach } from "vitest";

const kvPut = vi.fn();

vi.mock("@/lib/persistence/sqlite/kv", () => ({
  kvPut: (...args: unknown[]) => kvPut(...args),
  kvGet: vi.fn(),
}));

vi.mock("@/lib/db/queries/_shared/require-sql-executor", () => ({
  requireSqlExecutor: vi.fn(async () => ({ run: vi.fn(), all: vi.fn() })),
}));

describe("putSetting", () => {
  beforeEach(() => {
    kvPut.mockReset();
  });

  it("rethrows SQLite failures instead of swallowing them", async () => {
    kvPut.mockRejectedValueOnce(new Error("sqlite down"));
    vi.resetModules();
    const { putSetting } = await import("@/lib/db/queries/settings");
    await expect(putSetting("appSettings", { locale: "me" })).rejects.toThrow("sqlite down");
  });

  it("notifies listeners only after a successful write", async () => {
    kvPut.mockResolvedValueOnce(undefined);
    vi.resetModules();
    const { putSetting, onSettingsChanged } = await import("@/lib/db/queries/settings");
    const listener = vi.fn();
    const off = onSettingsChanged("", listener);
    await putSetting("appSettings", { locale: "me" });
    off();
    expect(listener).toHaveBeenCalledWith("appSettings");
  });
});
