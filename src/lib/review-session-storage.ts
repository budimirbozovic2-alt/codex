/**
 * Single source of truth for the in-progress review session localStorage slot.
 * Both `ReviewSession` (read/write) and import flows (clear-on-overwrite) go
 * through here so the key string lives in exactly one place.
 */
export const REVIEW_SESSION_KEY = "sr-review-session";

export function clearReviewSession(): void {
  try {
    localStorage.removeItem(REVIEW_SESSION_KEY);
  } catch {
    /* localStorage disabled / privacy mode — safe to ignore */
  }
}
