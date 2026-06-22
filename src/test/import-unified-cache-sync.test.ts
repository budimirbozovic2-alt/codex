import { describe, expect, it, afterEach, vi } from "vitest";
import { queryClient } from "@/lib/query/client";
import { syncImportSatelliteCaches } from "@/lib/query/all-caches-coordinator";
import {
  _resetBridgesForTest,
  installQueryBridges,
} from "@/lib/query/bridges";
import * as eventBus from "@/lib/event-bus";

describe("import satellite cache sync", () => {
  afterEach(() => {
    _resetBridgesForTest();
    vi.restoreAllMocks();
  });

  it("syncImportSatelliteCaches refreshes non-core TanStack domains via bridges", async () => {
    installQueryBridges(queryClient);
    const emitSpy = vi.spyOn(eventBus, "emitDomainChanged");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    syncImportSatelliteCaches();

    expect(emitSpy).toHaveBeenCalledWith({ domain: "sources" });

    await vi.waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["mindMaps"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["mnemonics"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["knowledgeBase"] });
    });
  });
});
