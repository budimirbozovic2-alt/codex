/**
 * Event bus constants & types.
 *
 * Carries core infrastructure events and domain change notifications.
 *
 * PR-H6: Formatted for Safe-Paste constraint.
 */

export const EVENT_TYPES = {
  DB_BLOCKED: "db:blocked",
  DB_UNBLOCKED: "db:unblocked",
  DB_ERROR_CHANGED: "db:error-changed",
  DOMAIN_CHANGED: "domain:changed",
} as const;

export type EventType = 
  typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

export interface EventMessage<T = unknown> {
  type: EventType;
  payload?: T;
  timestamp: number;
  sourceTabId: string;
}

// ─── Domain change payload types ────────────────────────────────────────────
// Defined here (not imported from domain modules) to keep the event bus layer
// free of cross-domain coupling. Domain modules use these types when emitting.

export type CardsChangedScope =
  | { kind: "all" }
  | { kind: "derived" }
  | { kind: "category"; categoryId: string }
  | { kind: "subcategory"; categoryId: string; subcategoryId: string }
  | { kind: "chapter"; categoryId: string; chapterId: string }
  | { kind: "source"; sourceId: string };

export type PlannerChangedKind =
  | "config"
  | "discipline"
  | "dailyMapped"
  | "lastRedistribute";

export type CategoriesChangedScope =
  | { kind: "all" }
  | { kind: "byId"; categoryId: string };

export type DomainChangedPayload =
  | { domain: "cards"; scope: CardsChangedScope }
  | { domain: "categories"; scope: CategoriesChangedScope }
  | { domain: "review"; kind: "append" | "replace" }
  | { domain: "settings"; kind: "sr" }
  | { domain: "planner"; kind: PlannerChangedKind }
  | { domain: "sources" }
  | { domain: "mindmaps" }
  | { domain: "zettelkasten" }
  | { domain: "mnemonics" };