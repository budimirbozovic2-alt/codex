/**
 * Phase A / P0 smoke tests.
 *
 * Verificira:
 *   1. CardForm na unmount NE mutira `document.body.style.pointerEvents`
 *      (vlasništvo je strogo u `installBodyPointerEventsGuard`).
 *   2. `usePersistingState` ne instalira `setInterval` (ne curi resurs).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { usePersistingState } from "@/hooks/usePersistingState";
import { INTEGRATION_TEST_TIMEOUT_MS } from "./helpers/test-timeouts";

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

// ── 1. CardForm body.style guard ───────────────────────────────────────
describe("CardForm — ne mutira document.body.style.pointerEvents", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(() => {
    document.body.style.pointerEvents = "";
  });
  afterEach(() => {
    cleanup();
    document.body.style.pointerEvents = "";
  });

  it("mount + unmount ne dira body.style.pointerEvents", async () => {
    const CardForm = (await import("@/components/CardForm")).default;
    document.body.style.pointerEvents = "none"; // simulira aktivan Radix lock

    const { unmount } = render(
      <MemoryRouter>
        <CardForm
          categories={["Test"]}
          subcategories={{ Test: [] }}
          onSave={() => {}}
          onSaveFlash={() => {}}
          onCancel={() => {}}
        />
      </MemoryRouter>,
    );
    expect(document.body.style.pointerEvents).toBe("none");
    unmount();
    // Bug-fix invariant: CardForm NE smije resetovati body.style — guard je vlasnik.
    expect(document.body.style.pointerEvents).toBe("none");
  });
});

// ── 2. usePersistingState — bez setInterval-a ─────────────────────────
describe("usePersistingState — nema poll-loop-a", () => {
  it("ne instalira setInterval", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    const { unmount } = renderHook(() => usePersistingState(), { wrapper: makeWrapper() });
    expect(spy).not.toHaveBeenCalled();
    unmount();
    spy.mockRestore();
  });

  it("vraća hasPending: false kad nema aktivnih mutacija", () => {
    const { result } = renderHook(() => usePersistingState(), { wrapper: makeWrapper() });
    expect(result.current.hasPending).toBe(false);
    expect(result.current.pendingCount).toBe(0);
  });
});
