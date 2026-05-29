/**
 * Single source of truth for the in-progress review session slot.
 *
 * Owns BOTH the key string AND all read/write logic. UI components
 * (ReviewSession) and import flows go through this module — they MUST NOT
 * import `getSetting`/`putSetting` directly for the session slot.
 */
import { getSetting, putSetting } from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import type { ReviewMode } from "@/components/review/review-constants";

export const REVIEW_SESSION_KEY = "sr-review-session";

const TTL_MS = 2 * 60 * 60 * 1000; // 2h

export interface SavedReviewSession {
  mode: ReviewMode;
  randomIndex: number;
  timestamp: number;
}


function isFreshSession(s: unknown): s is SavedReviewSession {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.timestamp === "number" &&
    Number.isFinite(o.timestamp) &&
    Date.now() - o.timestamp < TTL_MS
  );
}

/**
 * Load the saved session (IDB), one-shot migrating from legacy localStorage
 * slot. Returns null when no fresh session exists; stale entries are evicted.
 */
export async function loadSavedReviewSession(): Promise<SavedReviewSession | null> {
  let state = (await getSetting<SavedReviewSession | null>(REVIEW_SESSION_KEY)) ?? null;

  if (!state) {
    try {
      const raw = localStorage.getItem(REVIEW_SESSION_KEY);
      if (raw) {
        state = JSON.parse(raw) as SavedReviewSession;
        await putSetting(REVIEW_SESSION_KEY, state);
        localStorage.removeItem(REVIEW_SESSION_KEY);
      }
    } catch (err: unknown) {
      logger.debug("[review-session-storage] migrate failed", err);
    }
  }

  if (isFreshSession(state)) return state;
  if (state) await putSetting(REVIEW_SESSION_KEY, null);
  return null;
}

export async function saveReviewSession(state: SavedReviewSession): Promise<void> {
  try {
    await putSetting(REVIEW_SESSION_KEY, state);
  } catch (err: unknown) {
    logger.debug("[review-session-storage] save failed", err);
  }
}

/** Clear from IDB (preferred). */
export async function clearSavedReviewSession(): Promise<void> {
  try {
    await putSetting(REVIEW_SESSION_KEY, null);
  } catch (err: unknown) {
    logger.debug("[review-session-storage] clear failed", err);
  }
}

/** Clear from legacy localStorage slot (import overwrite path). */
export function clearReviewSession(): void {
  try {
    localStorage.removeItem(REVIEW_SESSION_KEY);
  } catch {
    /* privacy mode — ignore */
  }
}
