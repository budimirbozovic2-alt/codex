/**
 * Event Bus sistem baziran na BroadcastChannel API-ju.
 * Omogućava sinhronizaciju podataka između različitih tabova i komponenti.
 */

export const EVENT_TYPES = {
  MNEMONICS_UPDATED: "mnemonics:updated",
  CARDS_UPDATED: "cards:updated",
  DB_BLOCKED: "db:blocked",
  DB_UNBLOCKED: "db:unblocked",
  TAB_HEARTBEAT: "tab:heartbeat",
  TAB_REPLY: "tab:reply",
  TAB_LEAVING: "tab:leaving",
  KB_ARTICLE_UPSERTED: "kb-article:upserted",
  KB_ARTICLE_REMOVED: "kb-article:removed",
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

export interface EventMessage<T = any> {
  type: EventType;
  payload?: T;
  timestamp: number;
  sourceTabId: string;
}

// Generišemo jedinstveni ID za trenutni tab/prozor
const TAB_ID = crypto.randomUUID();
const CHANNEL_NAME = "codex_event_bus";

class EventBus {
  private channel: BroadcastChannel | null = null;
  private listeners: Map<EventType, Set<(payload: any) => void>> = new Map();
  private activeTabs: Map<string, number> = new Map();
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  private _beforeUnloadHandler: (() => void) | null = null;

  constructor() {
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
        console.warn("[EventBus] BroadcastChannel nije podržan u ovom pregledaču. Sinhronizacija između tabova neće raditi.");
      }
    } catch (err) {
      console.error("[EventBus] Greška pri inicijalizaciji:", err);
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
   * Vraća broj aktivnih tabova detektovanih putem heartbeat mehanizma.
   * Uključuje i trenutni tab.
   */
  getTabCount(): number {
    return this.activeTabs.size + 1; // +1 za trenutni tab
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
      console.error(`[EventBus] Greška pri slanju poruke (${type}):`, err);
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
    this.listeners.get(type)!.add(callback);

    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  private handleIncomingMessage(message: EventMessage): void {
    const typeListeners = this.listeners.get(message.type);
    if (typeListeners) {
      typeListeners.forEach((callback) => {
        try {
          callback(message.payload);
        } catch (err) {
          console.error(`[EventBus] Greška u listeneru za ${message.type}:`, err);
        }
      });
    }
  }
}

// Singleton instanca za cijelu aplikaciju
export const eventBus = new EventBus();

// HMR cleanup — prevent BroadcastChannel accumulation during development
if (import.meta.hot) {
  import.meta.hot.dispose(() => eventBus.destroy());
}
