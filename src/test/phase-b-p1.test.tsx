/**
 * Phase B (P1) smoke tests.
 *
 * 1. SessionContext: `isProcessing` clears after endSession + mutation drain.
 * 2. JSON serialize client falls back to synchronous stringify when no
 *    Worker is available (jsdom environment).
 * 3. Wiki-link auto-create no longer keeps `articles` in its main deps —
 *    sanity-check via grep that the source file does not reintroduce it.
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSessionContext } from "@/store/useSessionStore";
import { serializeRowsInWorker } from "@/lib/backup/json-serialize-client";
import fs from "node:fs";
import path from "node:path";

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

describe("Phase B / P1", () => {
  it("SessionContext: isProcessing clears immediately after endSession resolves (no padding)", async () => {
    const { result } = renderHook(() => useSessionContext(), { wrapper: makeWrapper() });

    expect(result.current.isProcessing).toBe(false);
    act(() => result.current.startSession([], []));
    expect(result.current.isSessionActive).toBe(true);

    await act(async () => {
      await result.current.endSession(() => {}, () => {}, () => {});
    });

    // With no pending writes, isProcessing must be false immediately after
    // endSession resolves — no arbitrary 200ms delay.
    expect(result.current.isProcessing).toBe(false);
  });

  it("json-serialize-client returns the same fragment as inline JSON.stringify", async () => {
    const rows = [{ a: 1 }, { b: "x" }, { c: [1, 2, 3] }];
    const chunk = await serializeRowsInWorker(rows);
    const expected = rows.map((r) => JSON.stringify(r)).join(",");
    expect(chunk).toBe(expected);
  });

  it("json-serialize-client handles empty batch", async () => {
    expect(await serializeRowsInWorker([])).toBe("");
  });

  it("useWikiLinkAutoCreate: `articles` is not in the main effect deps", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../hooks/useWikiLinkAutoCreate.ts"),
      "utf8",
    );
    // The auto-create useEffect deps tuple must not reference `articles`
    // directly any more (idempotency token + ref pattern took over).
    const match = src.match(/}, \[draftContent, isEditing, categoryId,([^\]]*)\]/);
    expect(match).toBeTruthy();
    expect(match![1]).not.toMatch(/\barticles\b/);
    expect(match![1]).toMatch(/drainTick/);
  });
});
