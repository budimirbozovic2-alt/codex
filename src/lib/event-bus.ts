/**
 * Lean in-process pub/sub system.
 * Cross-tab overhead removed for desktop Electron.
 *
 * Pinned to globalThis via Symbol to survive HMR.
 *
 * PR-H6: Fixed destructive softReset during HMR
 * reload cycles to prevent multi-module listener drop.
 */

import { 
  type EventType, 
  type EventMessage,
  type DomainChangedPayload,
  EVENT_TYPES,
} from "./event-bus-types";
import { logger } from "@/lib/logger";
export { 
  EVENT_TYPES, 
  type EventType, 
  type EventMessage,
  type DomainChangedPayload,
  type CardsChangedScope,
  type PlannerChangedKind,
} from "./event-bus-types";

const BUS_KEY: unique symbol = Symbol.for("codex.eventbus") as never;

interface CodexGlobalSlots {
  [BUS_KEY]?: EventBus;
}
const slots = globalThis as typeof globalThis & CodexGlobalSlots;

class EventBus {
  private listeners: Map<
    EventType, 
    Set<(payload: unknown) => void>
  > = new Map();

  getTabCount(): number {
    return 1;
  }

  getListenerCount(type?: EventType): number {
    if (type) return this.listeners.get(type)?.size ?? 0;
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }

  emit<T>(type: EventType, payload?: T): void {
    const message: EventMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
      sourceTabId: "local",
    };
    this.dispatch(message);
  }

  subscribe<T>(
    type: EventType, 
    callback: (payload: T) => void
  ): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(
      callback as (payload: unknown) => void
    );
    return () => {
      this.listeners.get(type)?.delete(
        callback as (payload: unknown) => void
      );
    };
  }

  private dispatch(message: EventMessage): void {
    const typeListeners = this.listeners.get(message.type);
    if (!typeListeners) return;
    for (const callback of typeListeners) {
      try {
        callback(message.payload);
      } catch (err) {
        logger.error(
          `[EventBus] Error in listener for ${message.type}:`, 
          err
        );
      }
    }
  }

  destroy(): void {
    this.listeners.clear();
  }
}

// Singleton osiguran na globalThis nivou
export const eventBus: EventBus =
  slots[BUS_KEY] ?? (slots[BUS_KEY] = new EventBus());

// ─── Domain change helpers ───────────────────────────────────────────────────

export function emitDomainChanged(payload: DomainChangedPayload): void {
  eventBus.emit(EVENT_TYPES.DOMAIN_CHANGED, payload);
}

export function onDomainChanged(
  cb: (payload: DomainChangedPayload) => void
): () => void {
  return eventBus.subscribe(
    EVENT_TYPES.DOMAIN_CHANGED,
    cb as (payload: unknown) => void,
  );
}