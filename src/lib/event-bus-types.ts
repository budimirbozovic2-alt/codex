/**
 * Infrastructure event bus constants & types.
 * Domain cache invalidation uses direct TanStack paths (TD-ARCH-5).
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
