import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetBootStateForTests,
  getBootState,
  transition,
} from "@/lib/boot";

describe("PR4 — boot state machine tranzicije", () => {
  beforeEach(() => __resetBootStateForTests());

  it("idle → opening → ready (happy path)", () => {
    expect(getBootState().type).toBe("idle");
    transition({ type: "OPEN_START" });
    expect(getBootState().type).toBe("opening");
    transition({ type: "MIGRATE_START", from: 0, to: 0 });
    expect(getBootState().type).toBe("migrating");
    transition({ type: "MIGRATE_DONE" });
    expect(getBootState().type).toBe("loading");
    transition({ type: "LOAD_PROGRESS", pct: 50, label: "x" });
    const s = getBootState();
    expect(s.type === "loading" && s.pct === 50).toBe(true);
    transition({ type: "READY" });
    expect(getBootState().type).toBe("ready");
  });

  it("OPEN_BLOCKED je terminalno dok RESET ne stigne", () => {
    transition({ type: "OPEN_START" });
    transition({ type: "OPEN_BLOCKED", tabCount: 3 });
    const s = getBootState();
    expect(s.type === "blocked" && s.reason === "tabs" && s.tabCount === 3).toBe(true);
    // ne pomijera se na READY direktno
    transition({ type: "READY" });
    expect(getBootState().type).toBe("blocked");
    // OPEN_OK kao recovery
    transition({ type: "OPEN_OK" });
    expect(getBootState().type).toBe("ready");
  });

  it("VERSION_MISMATCH i CORRUPTED su zalijepljeni dok ne RESET-ujem", () => {
    transition({ type: "VERSION_MISMATCH", message: "v" });
    expect(getBootState().type).toBe("version");
    transition({ type: "MIGRATE_START", from: 0, to: 1 });
    expect(getBootState().type).toBe("version");
    transition({ type: "RESET" });
    expect(getBootState().type).toBe("idle");
  });
});
