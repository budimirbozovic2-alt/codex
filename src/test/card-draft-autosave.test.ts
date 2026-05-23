/**
 * Unit tests for the Dexie-backed CardForm draft autosave (PR6).
 *
 * Covers:
 *  - Debounced write of meaningful drafts to the `drafts` table.
 *  - Empty/whitespace drafts are not persisted (and clear any stale row).
 *  - TTL expiry — old drafts are evicted on load.
 *  - Disabling autosave halts writes (e.g. while restore banner is pending).
 *  - clearDraft removes the row.
 *  - buildDraftKey discriminates between new vs edit and per-category slots.
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import {
  buildDraftKey,
  loadCardDraft,
  useCardDraftAutosave,
  type CardDraftSnapshot,
} from "@/hooks/useCardDraftAutosave";
import { db } from "@/lib/db-schema";
import { putDraft } from "@/lib/drafts/draftsTable";

const baseDraft = (overrides: Partial<CardDraftSnapshot> = {}): CardDraftSnapshot => ({
  cardType: "essay",
  question: "",
  flashAnswer: "",
  sections: [{ title: "Cjelina 1", content: "" }],
  categoryId: "cat-1",
  subcategoryId: "",
  chapterId: "",
  frequencyTag: "",
  sourceType: "",
  ...overrides,
});

async function getStored(key: string) {
  return db.drafts.get(key);
}

beforeEach(async () => {
  await db.drafts.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildDraftKey", () => {
  it("uses edit slot when editCardId is provided", () => {
    expect(buildDraftKey("card-123", "cat-A")).toBe("cardform:edit:card-123");
  });

  it("uses per-category new slot otherwise", () => {
    expect(buildDraftKey(null, "cat-A")).toBe("cardform:new:cat-A");
    expect(buildDraftKey(undefined, "")).toBe("cardform:new:global");
  });
});

describe("useCardDraftAutosave", () => {
  it("debounces writes and persists meaningful drafts to Dexie", async () => {
    const key = "cardform:new:cat-1";
    const draft = baseDraft({ question: "Šta je ugovor o radu?" });

    renderHook(() => useCardDraftAutosave(key, draft, true));

    expect(await getStored(key)).toBeUndefined();

    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    await vi.useRealTimers();
    await waitFor(async () => {
      const row = await getStored(key);
      expect(row).toBeTruthy();
      const payload = row!.payload as CardDraftSnapshot & { savedAt: number };
      expect(payload.question).toBe("Šta je ugovor o radu?");
      expect(typeof payload.savedAt).toBe("number");
    });
    vi.useFakeTimers();
  });

  it("does not persist empty drafts and clears stale rows", async () => {
    const key = "cardform:new:cat-empty";
    await putDraft({
      key,
      source: "cardform",
      payload: { ...baseDraft({ question: "old" }), savedAt: Date.now() },
      updatedAt: Date.now(),
    });

    renderHook(() => useCardDraftAutosave(key, baseDraft(), true));
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    await vi.useRealTimers();
    await waitFor(async () => {
      expect(await getStored(key)).toBeUndefined();
    });
    vi.useFakeTimers();
  });

  it("respects enabled=false (no writes)", async () => {
    const key = "cardform:new:cat-disabled";
    const draft = baseDraft({ question: "should not write" });

    renderHook(() => useCardDraftAutosave(key, draft, false));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(await getStored(key)).toBeUndefined();
  });

  it("clearDraft removes the row", async () => {
    const key = "cardform:new:cat-clear";
    const draft = baseDraft({ question: "to be cleared" });

    const { result } = renderHook(() => useCardDraftAutosave(key, draft, true));
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    await vi.useRealTimers();
    await waitFor(async () => { expect(await getStored(key)).toBeTruthy(); });

    await act(async () => { result.current.clearDraft(); });
    await waitFor(async () => { expect(await getStored(key)).toBeUndefined(); });
    vi.useFakeTimers();
  });
});

describe("loadCardDraft", () => {
  it("returns null when no row exists", async () => {
    expect(await loadCardDraft("missing-key")).toBeNull();
  });

  it("returns null and evicts entries older than TTL", async () => {
    const key = "cardform:new:cat-old";
    const ancient = Date.now() - 25 * 60 * 60 * 1000;
    await putDraft({
      key,
      source: "cardform",
      payload: { ...baseDraft({ question: "old" }), savedAt: ancient },
      updatedAt: ancient,
    });

    expect(await loadCardDraft(key)).toBeNull();
    expect(await getStored(key)).toBeUndefined();
  });

  it("returns fresh meaningful drafts", async () => {
    const key = "cardform:new:cat-fresh";
    await putDraft({
      key,
      source: "cardform",
      payload: { ...baseDraft({ question: "fresh" }), savedAt: Date.now() },
      updatedAt: Date.now(),
    });

    const loaded = await loadCardDraft(key);
    expect(loaded).not.toBeNull();
    expect(loaded!.question).toBe("fresh");
  });

  it("rejects empty drafts even if fresh", async () => {
    const key = "cardform:new:cat-empty-fresh";
    await putDraft({
      key,
      source: "cardform",
      payload: { ...baseDraft(), savedAt: Date.now() },
      updatedAt: Date.now(),
    });

    expect(await loadCardDraft(key)).toBeNull();
  });
});
