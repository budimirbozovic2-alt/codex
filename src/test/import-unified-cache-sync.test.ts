import { describe, expect, it, afterEach, vi } from "vitest";
import { queryClient } from "@/lib/query/client";
import { syncImportSatelliteCaches } from "@/lib/query/write-session";

describe("import satellite cache sync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("syncImportSatelliteCaches refreshes non-core TanStack domains directly", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    syncImportSatelliteCaches();

    await vi.waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sources"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["mindMaps"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["mnemonics"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["knowledgeBase"] });
    });
  });
});
