/**
 * Phase B (P1) smoke tests.
 *
 * 1. SessionContext: `isProcessing` is now derived from
 *    `isEnding || persistQueue.hasPending()` — no setTimeout padding.
 * 2. JSON serialize client falls back to synchronous stringify when no
 *    Worker is available (jsdom environment).
 * 3. Wiki-link auto-create no longer keeps `articles` in its main deps —
 *    sanity-check via grep that the source file does not reintroduce it.
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { SessionProvider, useSessionContext } from "@/contexts/SessionContext";
import { persistQueue } from "@/lib/persist-queue";
import { serializeRowsInWorker } from "@/lib/backup/json-serialize-client";
import fs from "node:fs";
import path from "node:path";

describe("Phase B / P1", () => {
  it("SessionContext: isProcessing clears as soon as queue drains (no setTimeout padding)", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SessionProvider>{children}</SessionProvider>
    );
    const { result } = renderHook(() => useSessionContext(), { wrapper });

    expect(result.current.isProcessing).toBe(false);
    act(() => result.current.startSession([], []));
    expect(result.current.isSessionActive).toBe(true);

    await act(async () => {
      await result.current.endSession(() => {}, () => {}, () => {});
    });

    // With no pending writes, isProcessing must be false immediately after
    // endSession resolves — no arbitrary 200ms delay.
    expect(persistQueue.hasPending()).toBe(false);
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
