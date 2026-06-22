import { describe, it, expect } from "vitest";
import {
  countEssaySatellites,
  previewEssaySatelliteLoad,
  SATELLITE_OVERLOAD_THRESHOLD,
} from "@/lib/saga/saga-attach";
import { makeCard } from "@/test/factories";

describe("saga-attach", () => {
  const essay = makeCard({ id: "e1", type: "essay" });

  it("countEssaySatellites counts linked flash cards", () => {
    const flashes = Array.from({ length: 3 }, (_, i) =>
      makeCard({ id: `f${i}`, type: "flash", parentId: "e1" }),
    );
    const orphan = makeCard({ id: "f-orphan", type: "flash", parentId: "missing" });
    expect(countEssaySatellites([essay, ...flashes, orphan], "e1")).toBe(3);
  });

  it("previewEssaySatelliteLoad accounts for re-attach to same essay", () => {
    const existing = makeCard({ id: "f1", type: "flash", parentId: "e1" });
    const incoming = makeCard({ id: "f2", type: "flash" });
    const load = previewEssaySatelliteLoad([essay, existing, incoming], "e1", [
      existing.id,
      incoming.id,
    ]);
    expect(load.current).toBe(1);
    expect(load.newAttachments).toBe(1);
    expect(load.afterAttach).toBe(2);
    expect(load.isOverloaded).toBe(false);
  });

  it("previewEssaySatelliteLoad flags overload above threshold", () => {
    const existing = Array.from({ length: SATELLITE_OVERLOAD_THRESHOLD }, (_, i) =>
      makeCard({ id: `f${i}`, type: "flash", parentId: "e1" }),
    );
    const incoming = makeCard({ id: "f-new", type: "flash" });
    const load = previewEssaySatelliteLoad([essay, ...existing, incoming], "e1", [incoming.id]);
    expect(load.afterAttach).toBe(SATELLITE_OVERLOAD_THRESHOLD + 1);
    expect(load.isOverloaded).toBe(true);
  });
});
