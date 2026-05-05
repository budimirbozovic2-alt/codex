import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditReturn } from "@/hooks/useEditReturn";
import { setEditingCardId } from "@/contexts/ui/UIProvider";

// We read what was stashed by peeking at sessionStorage directly — same key
// used by the lib (sr-edit-return-context:state).
const STATE_KEY = "sr-edit-return-context:state";
function readSnap(): { cardId?: string } | null {
  const raw = sessionStorage.getItem(STATE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw).data; } catch { return null; }
}

describe("useEditReturn — M3 explicit stash(cardId)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setEditingCardId(null);
    // jsdom default location — useEditReturn validates path against current
    // location, but we only assert on cardId so any path works.
  });

  it("records the explicit cardId from stash() argument", () => {
    const { result } = renderHook(() =>
      useEditReturn({ path: "/x" }),
    );
    act(() => result.current.stash("card-A"));
    expect(readSnap()?.cardId).toBe("card-A");

    act(() => result.current.stash("card-B"));
    expect(readSnap()?.cardId).toBe("card-B");
  });

  it("falls back to SSOT mirror when no override is provided", () => {
    setEditingCardId("ssot-1");
    const { result } = renderHook(() =>
      useEditReturn({ path: "/x" }),
    );
    act(() => result.current.stash());
    expect(readSnap()?.cardId).toBe("ssot-1");
  });

  it("explicit override beats SSOT mirror", () => {
    setEditingCardId("ssot-old");
    const { result } = renderHook(() =>
      useEditReturn({ path: "/x" }),
    );
    act(() => result.current.stash("explicit-new"));
    expect(readSnap()?.cardId).toBe("explicit-new");
  });
});
