/**
 * Event bus constants & types.
 *
 * Carries only core infrastructure events.
 * Domain events are handled by Zustand singletons.
 *
 * PR-H6: Formatted for Safe-Paste constraint.
 */

export const EVENT_TYPES = {
  DB_BLOCKED: "db:blocked",
  DB_UNBLOCKED: "db:unblocked",
  DB_ERROR_CHANGED: "db:error-changed",
} as const;

export type EventType = 
  typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

export interface EventMessage<T = unknown> {
  type: EventType;
  payload?: T;
  timestamp: number;
  sourceTabId: string;
}