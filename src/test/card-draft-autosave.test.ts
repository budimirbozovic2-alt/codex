/**
 * Unit tests for the CardForm draft autosave (PR6).
 *
 * F6 final-Dexie-drop: routes through SQLite drafts repo via the harness;
 * direct Dexie poking is gone.
 */
import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import {
  buildDraftKey,
  loadCardDraft,
  useCardDraftAutosave,
  type CardDraftSnapshot,
} from "@/hooks/useCardDraftAutosave";
import { getDraft, putDraft } from "@/lib/db/queries";

const baseDraft = (overrides: Partial<CardDraftSnapshot> = {}): CardDraftSnapshot => ({
  cardType: "essay",
  question: "",
  flashAnswer: "",
  sections: [{ title: "Cjelina 1", content: "", contentDoc: { version: 4, content: { type: "doc", content: [] } } }],
  categoryId: "cat-1",
  subcategoryId: "",
  chapterId: "",
  frequencyTag: "",
  sourceType: "",
  ...overrides,
});

const getStored = (key: string) => getDraft(key);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  it("debounces writes and persists meaningful drafts", async () => {
    const key = "cardform:new:cat-1";
    const draft = baseDraft({ question: "Šta je ugovor o radu?" });

    renderHook(() => useCardDraftAutosave(key, draft, true));

    expect(await getStored(key)).toBeUndefined();
    await sleep(900);
    await waitFor(async () => {
      const row = await getStored(key);
      expect(row).toBeTruthy();
      const payload = row!.payload as CardDraftSnapshot & { savedAt: number };
      expect(payload.question).toBe("Šta je ugovor o radu?");
    }, { timeout: 2000 });
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
    await sleep(900);
    await waitFor(async () => { expect(await getStored(key)).toBeUndefined(); }, { timeout: 2000 });
  });

  it("respects enabled=false (no writes)", async () => {
    const key = "cardform:new:cat-disabled";
    const draft = baseDraft({ question: "should not write" });

    renderHook(() => useCardDraftAutosave(key, draft, false));
    await sleep(900);
    expect(await getStored(key)).toBeUndefined();
  });

  it("clearDraft removes the row", async () => {
    const key = "cardform:new:cat-clear";
    const draft = baseDraft({ question: "to be cleared" });

    const { result } = renderHook(() => useCardDraftAutosave(key, draft, true));
    await sleep(900);
    await waitFor(async () => { expect(await getStored(key)).toBeTruthy(); }, { timeout: 2000 });

    result.current.clearDraft();
    await waitFor(async () => { expect(await getStored(key)).toBeUndefined(); }, { timeout: 2000 });
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
      key, source: "cardform",
      payload: { ...baseDraft({ question: "old" }), savedAt: ancient },
      updatedAt: ancient,
    });
    expect(await loadCardDraft(key)).toBeNull();
    expect(await getStored(key)).toBeUndefined();
  });

  it("returns fresh meaningful drafts", async () => {
    const key = "cardform:new:cat-fresh";
    await putDraft({
      key, source: "cardform",
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
      key, source: "cardform",
      payload: { ...baseDraft(), savedAt: Date.now() },
      updatedAt: Date.now(),
    });
    expect(await loadCardDraft(key)).toBeNull();
  });
});
