/**
 * Centralized logger — primary surface for any new diagnostic output.
 *
 * Production behavior
 * -------------------
 * - `log/info/debug/warn` are no-ops in production. The Vite esbuild `pure`
 *   config additionally tree-shakes any direct `console.log/info/debug/warn`
 *   call site for defense-in-depth, but new code should prefer this module
 *   so intent (and any future structured-log routing) lives in one place.
 * - `error` ALWAYS executes — genuine crash signals must reach the
 *   DevTools console and the existing crash-log path.
 *
 * Migration policy
 * ----------------
 * Existing `console.*` call sites are left in place; esbuild handles the
 * prod strip. New code, and any file we touch for unrelated reasons, should
 * route through `logger`.
 */

const isDev =
  typeof import.meta !== "undefined" &&
  // Vite injects MODE at build time; dev mode keeps full verbosity.
  import.meta.env?.MODE !== "production";

type LogArgs = readonly unknown[];

function noop(): void {
  /* stripped in production */
}

export const logger = {
  log: isDev ? (...args: LogArgs) => console.log(...args) : noop,
  info: isDev ? (...args: LogArgs) => console.info(...args) : noop,
  debug: isDev ? (...args: LogArgs) => console.debug(...args) : noop,
  warn: isDev ? (...args: LogArgs) => console.warn(...args) : noop,
  // Errors always surface — they feed the crash log and user-facing toasts.
  error: (...args: LogArgs) => console.error(...args),
} as const;

export type Logger = typeof logger;
