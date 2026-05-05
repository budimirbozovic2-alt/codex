/**
 * Event bus constants & types — extracted from event-bus.ts to break the
 * circular import between db-schema.ts and event-bus.ts (W1). Importing only
 * from this file lets emitters reach for `EVENT_TYPES` without pulling in the
 * `EventBus` instance (which itself imports DB-side types in some paths).
 */

export const EVENT_TYPES = {
  MNEMONICS_UPDATED: "mnemonics:updated",
  CARDS_UPDATED: "cards:updated",
  DB_BLOCKED: "db:blocked",
  DB_UNBLOCKED: "db:unblocked",
  DB_ERROR_CHANGED: "db:error-changed",
  TAB_HEARTBEAT: "tab:heartbeat",
  TAB_REPLY: "tab:reply",
  TAB_LEAVING: "tab:leaving",
  KB_ARTICLE_UPSERTED: "kb-article:upserted",
  KB_ARTICLE_REMOVED: "kb-article:removed",
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

export interface EventMessage<T = unknown> {
  type: EventType;
  payload?: T;
  timestamp: number;
  sourceTabId: string;
}
