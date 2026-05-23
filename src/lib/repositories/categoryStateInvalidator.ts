// ─────────────────────────────────────────────────────────────────────────────
// Phase 5A — categoryRecords invalidator.
//
// Subscribes to CATEGORIES_UPDATED from the bus. When the event comes from
// outside our optimistic path (anything not tagged "repository*"), reload
// the full category list from IDB and push it into the React state via the
// setter registered by `CategoryStateProvider`.
//
// The setter is registered lazily so this module has no React import and
// can be initialised during boot (before the provider mounts) without
// crashing — events that fire before registration are simply dropped.
// ─────────────────────────────────────────────────────────────────────────────
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import { idbLoadCategories, type CategoryRecord } from "@/lib/db";
import { logger } from "@/lib/logger";
import { setCategoryStoreRecords } from "@/store/useCategoryStore";
import type { CategoriesUpdatedPayload } from "./categoryRepository";

const SELF_SOURCES = new Set(["repository", "repository-replace"]);

type Setter = (records: CategoryRecord[]) => void;

let _setter: Setter | null = null;
let _initialized = false;
let _unsub: (() => void) | null = null;
let _fetchSequence = 0;

/** Called by CategoryStateProvider on mount; swap on HMR is safe. */
export function registerCategoryStateSetter(setter: Setter | null): void {
  _setter = setter;
}

export function initCategoryStateInvalidator(): () => void {
  if (_initialized && _unsub) return _unsub;
  _initialized = true;

  _unsub = eventBus.subscribe<CategoriesUpdatedPayload>(
    EVENT_TYPES.CATEGORIES_UPDATED,
    (payload) => {
      if (!payload || SELF_SOURCES.has(payload.source)) return;
      if (!_setter) return;
      const seq = ++_fetchSequence;
      void idbLoadCategories()
        .then((records) => {
          if (seq !== _fetchSequence) return;
          _setter?.(records);
        })
        .catch((e) => logger.warn("[categoryStateInvalidator] reload failed", e));
    },
  );
  return _unsub;
}

export function __teardownCategoryStateInvalidatorForTests(): void {
  if (_unsub) _unsub();
  _unsub = null;
  _initialized = false;
  _setter = null;
  _fetchSequence = 0;
}
