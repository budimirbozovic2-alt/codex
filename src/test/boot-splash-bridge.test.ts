/**
 * Splash bridge test — verifikuje da subscribe na boot state machine
 * korektno mapira faze u splash DOM i emituje phase enter/exit telemetriju.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock splash DOM helpers prije nego što bridge bude import-ovan
const splashProgressMock = vi.fn();
const cleanupSplashMock = vi.fn();
vi.mock("@/hooks/card-bootstrap/splash", () => ({
  splashProgress: splashProgressMock,
  cleanupSplash: cleanupSplashMock,
}));

const markBootStepMock = vi.fn();
vi.mock("@/lib/boot-trace", () => ({
  markBootStep: markBootStepMock,
  getBootTrace: () => [],
}));

import { transition, __resetBootStateForTests } from "@/lib/boot/bootStateMachine";
import { installSplashBridge, __resetSplashBridgeForTests } from "@/lib/boot/splashBridge";

describe("splash bridge", () => {
  beforeEach(() => {
    __resetBootStateForTests();
    __resetSplashBridgeForTests();
    splashProgressMock.mockClear();
    cleanupSplashMock.mockClear();
    markBootStepMock.mockClear();
  });

  it("mapira fazu schema u splash sa odgovarajućim pct opsegom (10..40)", () => {
    installSplashBridge();
    transition({ type: "SCHEMA_START" });
    transition({ type: "SCHEMA_PROGRESS", pct: 50, label: "Migracija…" });
    const calls = splashProgressMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const last = calls[calls.length - 1];
    expect(last[0]).toBe(10 + Math.round(50 * 0.3)); // 25
    expect(last[1]).toBe("Migracija…");
  });

  it("okida cleanupSplash na READY", () => {
    installSplashBridge();
    transition({ type: "SCHEMA_START" });
    transition({ type: "SCHEMA_DONE" });
    transition({ type: "READY" });
    expect(cleanupSplashMock).toHaveBeenCalled();
  });

  it("okida cleanupSplash na schema-error (recovery UI preuzima)", () => {
    installSplashBridge();
    transition({ type: "SCHEMA_FAIL", cause: "unknown", message: "boom" });
    expect(cleanupSplashMock).toHaveBeenCalled();
  });

  it("emituje boot:phase:enter / boot:phase:exit telemetriju pri promjeni faze", () => {
    installSplashBridge();
    transition({ type: "OPEN_START" });
    transition({ type: "SCHEMA_START" });
    transition({ type: "SCHEMA_DONE" }); // → loading
    transition({ type: "READY" });
    const steps = markBootStepMock.mock.calls.map((c) => c[0] as string);
    expect(steps).toContain("boot:phase:enter:opening");
    expect(steps).toContain("boot:phase:exit:opening");
    expect(steps).toContain("boot:phase:enter:schema");
    expect(steps).toContain("boot:phase:enter:loading");
    expect(steps).toContain("boot:phase:enter:ready");
  });

  it("emituje boot:heal-degraded sa skipped step-ovima", () => {
    installSplashBridge();
    transition({ type: "HEAL_START" });
    transition({ type: "HEAL_STEP_FAIL", step: "taxonomy" });
    transition({ type: "HEAL_STEP_FAIL", step: "shapes" });
    transition({ type: "HEAL_DONE" }); // exit healing
    const degraded = markBootStepMock.mock.calls.find((c) => c[0] === "boot:heal-degraded");
    expect(degraded).toBeDefined();
    expect(degraded?.[1]).toContain("taxonomy");
    expect(degraded?.[1]).toContain("shapes");
  });

  it("idempotentan install — drugi poziv ne duplira listenere", () => {
    installSplashBridge();
    installSplashBridge();
    transition({ type: "SCHEMA_START" });
    // Jedan listener bi trebao biti registrovan → samo jedan splashProgress poziv za SCHEMA_START
    const schemaCalls = splashProgressMock.mock.calls.filter((c) => c[1] === "Schema upgrade…" || (typeof c[1] === "string" && c[1].includes("Schema")));
    // Bridge mapira SCHEMA_START → splashProgress(10, "Schema upgrade…") jednom
    expect(schemaCalls.length).toBe(1);
  });
});
