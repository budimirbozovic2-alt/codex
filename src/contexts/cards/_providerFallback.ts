/**
 * PR2 — Provider fallback policy.
 *
 * Prije: hook-ovi (useCardOnlyActions, useCategoryActions, useBackupActions)
 * vraćali su `new Proxy({}, { get: () => noop })` kad provider nije montiran,
 * sa `console.warn` samo u DEV-u. PROD je tiho gutao klikove (delete, save,
 * import) — to su bili tihi UX defekti.
 *
 * Sada: i DEV i PROD throw-uju jasnu grešku. Prije throw-a emitujemo
 * `PROVIDER_FALLBACK` telemetriju kako bi crash log mogao da identifikuje
 * provider/hook po imenu.
 *
 * HMR transient (originalni razlog za noop) rješava se na pravom mjestu —
 * `key={...}` na root provider tree-u u MainLayout-u, ne maskiranjem grešaka.
 */
import { eventBus } from "@/lib/event-bus";
import { EVENT_TYPES } from "@/lib/event-bus-types";
import { logger } from "@/lib/logger";

export interface ProviderFallbackPayload {
  provider: string;
  hook: string;
}

export function missingProvider(provider: string, hook: string): never {
  const payload: ProviderFallbackPayload = { provider, hook };
  try {
    eventBus.emit(EVENT_TYPES.PROVIDER_FALLBACK, payload);
  } catch {
    /* bus failures must not mask the real error */
  }
  logger.error(`[provider-fallback] ${hook} used outside <${provider}>`);
  throw new Error(
    `${hook} must be used within <${provider}>. ` +
    `If you are seeing this in DEV after a fast-refresh, make sure the root ` +
    `provider tree has a stable key={} on remount.`,
  );
}
