/**
 * Event Bus sistem baziran na BroadcastChannel API-ju.
 * Omogućava sinhronizaciju podataka između različitih tabova i komponenti.
 *
 * W1: Constants/types live in `event-bus-types.ts` to break a circular import
 *     with `db-schema.ts` — re-exported here for backwards compatibility.
 * W2: `getListenerCount(type?)` exposes diagnostics (used by HealthMonitor).
 * W3: Instance is pinned to `globalThis` so HMR re-evaluation does NOT spawn
 *     a second EventBus. `_softReset()` clears listeners + reopens the channel
 *     while preserving identity for already-captured references.
 */

import { EVENT_TYPES, type EventType, type EventMessage } from "./event-bus-types";
import { logger } from "@/lib/logger";
export { EVENT_TYPES, type EventType, type EventMessage } from "./event-bus-types";

// Generišemo jedinstveni ID za trenutni tab/prozor (stabilan kroz HMR
// pomoću globalThis Symbol slot-a).
//
// Symbol.for() registry je svjesno globalan po realm-u (ista garancija kao
// raniji `globalThis.__codexEventBus`), ali key prostor je odvojen od string
// properties — drugi moduli ne mogu slučajno kolidirati pisanjem na isti
// imenovani slot.
const BUS_KEY: unique symbol = Symbol.for("codex.eventbus") as never;
const TAB_KEY: unique symbol = Symbol.for("codex.tabId") as never;

interface CodexGlobalSlots {
  [BUS_KEY]?: EventBus;
  [TAB_KEY]?: string;
}
const slots = globalThis as typeof globalThis & CodexGlobalSlots;

const TAB_ID: string =
  slots[TAB_KEY] ??
  (slots[TAB_KEY] = (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`);
const CHANNEL_NAME = "codex_event_bus";

class EventBus {
  private channel: BroadcastChannel | null = null;
  private listeners: Map<EventType, Set<(payload: unknown) => void>> = new Map();
  private activeTabs: Map<string, number> = new Map();
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  private _beforeUnloadHandler: (() => void) | null = null;

  constructor() {
    this._init();
  }

  private _init(): void {
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event: MessageEvent<EventMessage>) => {
          this.handleIncomingMessage(event.data);
        };

        // Heartbeat mechanism to track tab count
        this.subscribe<{ sourceTabId: string }>(EVENT_TYPES.TAB_HEARTBEAT, (payload) => {
          if (payload?.sourceTabId !== TAB_ID) {
            this.activeTabs.set(payload.sourceTabId, Date.now());
            this.emit(EVENT_TYPES.TAB_REPLY, { sourceTabId: TAB_ID });
          }
        });

        this.subscribe<{ sourceTabId: string }>(EVENT_TYPES.TAB_REPLY, (payload) => {
          if (payload?.sourceTabId !== TAB_ID) {
            this.activeTabs.set(payload.sourceTabId, Date.now());
          }
        });

        this.subscribe<{ sourceTabId: string }>(EVENT_TYPES.TAB_LEAVING, (payload) => {
          if (payload?.sourceTabId !== TAB_ID) {
            this.activeTabs.delete(payload.sourceTabId);
          }
        });

        // Notify others when leaving
        this._beforeUnloadHandler = () => this.emit(EVENT_TYPES.TAB_LEAVING, { sourceTabId: TAB_ID });
        window.addEventListener("beforeunload", this._beforeUnloadHandler);

        // Initial discovery
        this.emit(EVENT_TYPES.TAB_HEARTBEAT, { sourceTabId: TAB_ID });

        // Periodic heartbeat and cleanup (guard against duplicate intervals)
        if (this.heartbeatIntervalId) clearInterval(this.heartbeatIntervalId);
        this.heartbeatIntervalId = setInterval(() => {
          const now = Date.now();
          for (const [id, lastSeen] of this.activeTabs.entries()) {
            if (now - lastSeen > 12000) {
              this.activeTabs.delete(id);
            }
          }
          this.emit(EVENT_TYPES.TAB_HEARTBEAT, { sourceTabId: TAB_ID });
        }, 5000);

      } else {
        logger.warn("[EventBus] BroadcastChannel nije podržan u ovom pregledaču. Sinhronizacija između tabova neće raditi.");
      }
    } catch (err) {
      logger.error("[EventBus] Greška pri inicijalizaciji:", err);
    }
  }

  /** Čisti sve resurse — koristiti pri HMR cleanup-u */
  destroy(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
    if (this._beforeUnloadHandler) {
      window.removeEventListener("beforeunload", this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
    this.channel?.close();
    this.channel = null;
    this.listeners.clear();
    this.activeTabs.clear();
  }

  /**
   * W3: Soft reset — drop listeners and rotate the BroadcastChannel without
   * losing instance identity. Used by HMR dispose so consumers that captured
   * the singleton reference keep working after a hot reload.
   */
  _softReset(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
    if (this._beforeUnloadHandler) {
      try { window.removeEventListener("beforeunload", this._beforeUnloadHandler); } catch { /* noop */ }
      this._beforeUnloadHandler = null;
    }
    try { this.channel?.close(); } catch { /* noop */ }
    this.channel = null;
    this.listeners.clear();
    this.activeTabs.clear();
    this._init();
  }

  /**
   * Vraća broj aktivnih tabova detektovanih putem heartbeat mehanizma.
   * Uključuje i trenutni tab.
   */
  getTabCount(): number {
    return this.activeTabs.size + 1; // +1 za trenutni tab
  }

  /**
   * W2: Diagnostic — total listener count, or per-type when given.
   */
  getListenerCount(type?: EventType): number {
    if (type) return this.listeners.get(type)?.size ?? 0;
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  /**
   * Emituje događaj svim tabovima (uključujući i trenutni preko lokalnih listenera).
   */
  emit<T>(type: EventType, payload?: T): void {
    const message: EventMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
      sourceTabId: TAB_ID,
    };

    // Pošalji ostalim tabovima
    try {
      this.channel?.postMessage(message);
    } catch (err) {
      logger.error(`[EventBus] Greška pri slanju poruke (${type}):`, err);
    }

    // Obavesti lokalne listenere u trenutnom tabu
    this.handleIncomingMessage(message);
  }

  /**
   * Registruje listener za određeni tip događaja.
   * Vraća funkciju za uklanjanje listenera (cleanup).
   */
  subscribe<T>(type: EventType, callback: (payload: T) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback as (payload: unknown) => void);

    return () => {
      this.listeners.get(type)?.delete(callback as (payload: unknown) => void);
    };
  }

  private handleIncomingMessage(message: EventMessage): void {
    const typeListeners = this.listeners.get(message.type);
    if (typeListeners) {
      typeListeners.forEach((callback) => {
        try {
          callback(message.payload);
        } catch (err) {
          logger.error(`[EventBus] Greška u listeneru za ${message.type}:`, err);
        }
      });
    }
  }
}

// W3: Singleton pinned to `globalThis` so HMR module re-evaluation reuses the
// same instance instead of spawning a fresh BroadcastChannel + listeners.
export const eventBus: EventBus =
  slots[BUS_KEY] ?? (slots[BUS_KEY] = new EventBus());

// HMR cleanup — perform a soft reset (preserves singleton identity).
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try { eventBus._softReset(); } catch (e) { logger.warn("[EventBus] HMR softReset failed", e); }
  });
}
