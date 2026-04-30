/**
 * Unit tests for the LocalStorage-backed CardForm draft autosave (B9).
 *
 * Covers:
 *  - Debounced write of meaningful drafts to localStorage.
 *  - Empty/whitespace drafts are not persisted (and clear any stale entry).
 *  - TTL expiry — old drafts are evicted on load.
 *  - Disabling autosave halts writes (e.g. while restore banner is pending).
 *  - clearDraft removes the entry.
 *  - buildDraftKey discriminates between new vs edit and per-category slots.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  buildDraftKey,
  loadCardDraft,
  useCardDraftAutosave,
  type CardDraftSnapshot,
} from "@/hooks/useCardDraftAutosave";

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

beforeEach(() => {
  localStorage.clear();
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
  it("debounces writes and persists meaningful drafts", () => {
    const key = "cardform:new:cat-1";
    const draft = baseDraft({ question: "Šta je ugovor o radu?" });

    renderHook(() => useCardDraftAutosave(key, draft, true));

    expect(localStorage.getItem(key)).toBeNull();

    act(() => { vi.advanceTimersByTime(700); });

    const raw = localStorage.getItem(key);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.question).toBe("Šta je ugovor o radu?");
    expect(typeof parsed.savedAt).toBe("number");
  });

  it("does not persist empty drafts and clears stale entries", () => {
    const key = "cardform:new:cat-empty";
    localStorage.setItem(key, JSON.stringify({ ...baseDraft({ question: "old" }), savedAt: Date.now() }));

    renderHook(() => useCardDraftAutosave(key, baseDraft(), true));
    act(() => { vi.advanceTimersByTime(700); });

    expect(localStorage.getItem(key)).toBeNull();
  });

  it("respects enabled=false (no writes)", () => {
    const key = "cardform:new:cat-disabled";
    const draft = baseDraft({ question: "should not write" });

    renderHook(() => useCardDraftAutosave(key, draft, false));
    act(() => { vi.advanceTimersByTime(2000); });

    expect(localStorage.getItem(key)).toBeNull();
  });

  it("clearDraft removes the entry", () => {
    const key = "cardform:new:cat-clear";
    const draft = baseDraft({ question: "to be cleared" });

    const { result } = renderHook(() => useCardDraftAutosave(key, draft, true));
    act(() => { vi.advanceTimersByTime(700); });
    expect(localStorage.getItem(key)).toBeTruthy();

    act(() => { result.current.clearDraft(); });
    expect(localStorage.getItem(key)).toBeNull();
  });
});

describe("loadCardDraft", () => {
  it("returns null when no entry exists", () => {
    expect(loadCardDraft("missing-key")).toBeNull();
  });

  it("returns null and evicts entries older than TTL", () => {
    const key = "cardform:new:cat-old";
    const ancient = Date.now() - 25 * 60 * 60 * 1000;
    localStorage.setItem(key, JSON.stringify({ ...baseDraft({ question: "old" }), savedAt: ancient }));

    expect(loadCardDraft(key)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("returns fresh meaningful drafts", () => {
    const key = "cardform:new:cat-fresh";
    localStorage.setItem(key, JSON.stringify({ ...baseDraft({ question: "fresh" }), savedAt: Date.now() }));

    const loaded = loadCardDraft(key);
    expect(loaded).not.toBeNull();
    expect(loaded!.question).toBe("fresh");
  });

  it("rejects empty drafts even if fresh", () => {
    const key = "cardform:new:cat-empty-fresh";
    localStorage.setItem(key, JSON.stringify({ ...baseDraft(), savedAt: Date.now() }));

    expect(loadCardDraft(key)).toBeNull();
  });

  it("survives malformed JSON", () => {
    const key = "cardform:new:cat-bad";
    localStorage.setItem(key, "{not json");
    expect(loadCardDraft(key)).toBeNull();
  });
});
