import { Card } from "@/lib/spaced-repetition";
import {
  idbSaveCards,
  idbDeleteCard,
  idbBulkPutCards,
} from "@/lib/db";

// ─── Internal Map type for O(1) access ──────────────────
export type CardMap = Record<string, Card>;

export function arrayToMap(cards: Card[]): CardMap {
  const map: CardMap = {};
  for (const c of cards) map[c.id] = c;
  return map;
}

export function mapToArray(map: CardMap): Card[] {
  return Object.values(map);
}

// ─── Surgical persist helpers ───────────────────────────
export type PersistAction =
  | { type: "put"; card: Card }
  | { type: "delete"; id: string }
  | { type: "bulk"; cards: Card[] }
  | { type: "full"; map: CardMap };

function createPersistQueue() {
  const pending: PersistAction[] = [];
  let timer: number | null = null;

  async function flush() {
    timer = null;
    const actions = pending.splice(0);
    if (actions.length === 0) return;

    try {
      const fullAction = actions.find((a) => a.type === "full");
      if (fullAction && fullAction.type === "full") {
        await idbSaveCards(mapToArray(fullAction.map));
        return;
      }

      const puts: Card[] = [];
      const deletes: string[] = [];
      for (const a of actions) {
        if (a.type === "put") puts.push(a.card);
        else if (a.type === "delete") deletes.push(a.id);
        else if (a.type === "bulk") puts.push(...a.cards);
      }

      if (puts.length > 0) await idbBulkPutCards(puts);
      for (const id of deletes) await idbDeleteCard(id);
    } catch (err: any) {
      if (err?.message === "QUOTA_EXCEEDED") {
        const { toast } = await import("sonner");
        toast.error("Memorija browsera je puna! Exportuj backup i očisti nepotrebne podatke.");
      } else {
        console.error("[persistQueue] flush failed", err);
      }
    }
  }

  function schedule(action: PersistAction) {
    pending.push(action);
    if (timer !== null) return;
    timer = window.setTimeout(flush, 16);
  }

  function cleanup() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.length > 0) {
      flush();
    }
  }

  return { schedule, cleanup };
}

// Singleton persist queue — created once per module, safe for StrictMode double-mount
export const persistQueue = createPersistQueue();
export const schedulePersist = persistQueue.schedule;
