export type AppLocale = "me" | "en";

export const SUPPORTED_LOCALES: readonly AppLocale[] = ["me", "en"] as const;

export const DEFAULT_LOCALE: AppLocale = "me";

export function parseAppLocale(value: unknown): AppLocale {
  return value === "en" ? "en" : "me";
}
