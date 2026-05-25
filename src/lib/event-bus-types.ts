/**
 * Event bus constants & types.
 *
 * Post Task-B EventBus elimination: the bus carries only DB infrastructure
 * events that genuinely need cross-module fan-out from a module-level
 * emitter (no React provider available at that layer). All domain events
 * (cards/categories/mnemonics/zettelkasten articles) have been migrated to
 * direct Zustand store mutations + module-level singletons, so they no
 * longer appear here.
 */

export const EVENT_TYPES = {
  DB_BLOCKED: "db:blocked",
  DB_UNBLOCKED: "db:unblocked",
  DB_ERROR_CHANGED: "db:error-changed",
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];


export interface EventMessage<T = unknown> {
  type: EventType;
  payload?: T;
  timestamp: number;
  sourceTabId: string;
}
