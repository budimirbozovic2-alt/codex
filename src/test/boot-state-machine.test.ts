import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetBootStateForTests,
  getBootState,
  transition,
} from "@/lib/boot";

describe("Boot state machine — eksplicitne faze", () => {
  beforeEach(() => __resetBootStateForTests());

  it("idle → opening → schema → loading → ready (happy path)", () => {
    expect(getBootState().type).toBe("idle");
    transition({ type: "OPEN_START" });
    expect(getBootState().type).toBe("opening");
    transition({ type: "SCHEMA_START" });
    expect(getBootState().type).toBe("schema");
    transition({ type: "SCHEMA_PROGRESS", pct: 50, label: "x" });
    const s1 = getBootState();
    expect(s1.type === "schema" && s1.pct === 50).toBe(true);
    transition({ type: "SCHEMA_DONE" });
    expect(getBootState().type).toBe("loading");
    transition({ type: "LOAD_PROGRESS", pct: 60, label: "Učitano" });
    const s2 = getBootState();
    expect(s2.type === "loading" && s2.pct === 60).toBe(true);
    transition({ type: "READY" });
    expect(getBootState().type).toBe("ready");
  });

  it("backward kompat: MIGRATE_START → schema, MIGRATE_DONE → loading", () => {
    transition({ type: "OPEN_START" });
    transition({ type: "MIGRATE_START", from: 0, to: 0 });
    expect(getBootState().type).toBe("schema");
    transition({ type: "MIGRATE_DONE" });
    expect(getBootState().type).toBe("loading");
  });

  it("SCHEMA_FAIL → schema-error → RECOVERY_REQUESTED → opening", () => {
    transition({ type: "OPEN_START" });
    transition({ type: "SCHEMA_START" });
    transition({ type: "SCHEMA_FAIL", cause: "version", message: "v18 != v17" });
    const s = getBootState();
    expect(s.type === "schema-error" && s.cause === "version").toBe(true);
    // ostala stanja se ignorišu
    transition({ type: "READY" });
    expect(getBootState().type).toBe("schema-error");
    transition({ type: "RECOVERY_REQUESTED" });
    expect(getBootState().type).toBe("opening");
  });

  it("LOAD_FAIL → load-error → RECOVERY_REQUESTED → loading", () => {
    transition({ type: "OPEN_START" });
    transition({ type: "SCHEMA_START" });
    transition({ type: "SCHEMA_DONE" });
    transition({ type: "LOAD_FAIL", message: "idbLoadCards crash" });
    expect(getBootState().type).toBe("load-error");
    transition({ type: "RECOVERY_REQUESTED" });
    expect(getBootState().type).toBe("loading");
  });

  it("OPEN_BLOCKED je terminalno dok RESET ne stigne", () => {
    transition({ type: "OPEN_START" });
    transition({ type: "OPEN_BLOCKED", tabCount: 3 });
    const s = getBootState();
    expect(s.type === "blocked" && s.reason === "tabs" && s.tabCount === 3).toBe(true);
    transition({ type: "READY" });
    expect(getBootState().type).toBe("blocked");
    transition({ type: "OPEN_OK" });
    expect(getBootState().type).toBe("ready");
  });

  it("VERSION_MISMATCH je zalijepljen dok ne RESET-ujem", () => {
    transition({ type: "VERSION_MISMATCH", message: "v" });
    expect(getBootState().type).toBe("version");
    transition({ type: "SCHEMA_START" });
    expect(getBootState().type).toBe("version");
    transition({ type: "RESET" });
    expect(getBootState().type).toBe("idle");
  });
});
