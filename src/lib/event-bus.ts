/**
 * Lean in-process pub/sub. Ranije je vozio BroadcastChannel + heartbeat
 * cross-tab mašineriju; ta funkcionalnost je dead code na desktop-only
 * Electron platformi (jedan prozor po procesu), pa je uklonjena.
 *
 * Public API (emit / subscribe / getListenerCount / getTabCount /
 * destroy / _softReset) je nepromijenjen — svi postojeći pozivaoci rade
 * bez izmjena. `getTabCount()` sada uvijek vraća 1.
 *
 * Singleton je i dalje pinovan na `globalThis` preko `Symbol.for(...)` da
 * HMR re-evaluacija ne spawnuje drugi bus i ne duplira listenere.
 */

import { type EventType, type EventMessage } from "./event-bus-types";
import { logger } from "@/lib/logger";
export { EVENT_TYPES, type EventType, type EventMessage } from "./event-bus-types";

const BUS_KEY: unique symbol = Symbol.for("codex.eventbus") as never;

interface CodexGlobalSlots {
  [BUS_KEY]?: EventBus;
}
const slots = globalThis as typeof globalThis & CodexGlobalSlots;

class EventBus {
  private listeners: Map<EventType, Set<(payload: unknown) => void>> = new Map();

  /** Cross-tab eliminisan na desktop-only platformi — uvijek 1. */
  getTabCount(): number {
    return 1;
  }

  /** Diagnostic — total listener count, or per-type when given. */
  getListenerCount(type?: EventType): number {
    if (type) return this.listeners.get(type)?.size ?? 0;
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
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

  subscribe<T>(type: EventType, callback: (payload: T) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback as (payload: unknown) => void);
    return () => {
      this.listeners.get(type)?.delete(callback as (payload: unknown) => void);
    };
  }

  private dispatch(message: EventMessage): void {
    const typeListeners = this.listeners.get(message.type);
    if (!typeListeners) return;
    for (const callback of typeListeners) {
      try {
        callback(message.payload);
      } catch (err) {
        logger.error(`[EventBus] Greška u listeneru za ${message.type}:`, err);
      }
    }
  }

  /** Pre-bus više nije imao nikakav async resurs — listeners.clear() je sve. */
  destroy(): void {
    this.listeners.clear();
  }

  /** Soft reset (HMR dispose). Identičan destroy-u u lean implementaciji. */
  _softReset(): void {
    this.listeners.clear();
  }
}

// Singleton pinned to `globalThis` — preživljava HMR.
export const eventBus: EventBus =
  slots[BUS_KEY] ?? (slots[BUS_KEY] = new EventBus());

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try { eventBus._softReset(); } catch (e) { logger.warn("[EventBus] HMR softReset failed", e); }
  });
}

