import { describe, expect, it } from "vitest";
import { resolveAutoImportStrategy } from "@/lib/backup/resolve-import-strategy";

describe("resolveAutoImportStrategy", () => {
  it("keeps template imports additive", () => {
    expect(resolveAutoImportStrategy({
      type: "template",
      hasProgress: false,
      existingCardsCount: 0,
    })).toBe("keep");
  });

  it("overwrites empty db on full backup import", () => {
    expect(resolveAutoImportStrategy({
      type: "full",
      hasProgress: true,
      existingCardsCount: 0,
    })).toBe("overwrite");
  });

  it("keeps merge when db already has cards", () => {
    expect(resolveAutoImportStrategy({
      type: "full",
      hasProgress: true,
      existingCardsCount: 12,
    })).toBe("keep");
  });
});
