import type { AppLocale } from "./types";

export function applyDocumentLocale(locale: AppLocale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale === "me" ? "cnr" : "en";
}
