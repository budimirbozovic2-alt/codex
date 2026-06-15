import { loadAppSettings } from "@/lib/app-settings";
import { applyDocumentLocale } from "./document-locale";
import { DEFAULT_LOCALE } from "./types";

export { I18nProvider, useI18n } from "./I18nProvider";
export { applyDocumentLocale } from "./document-locale";
export { createTranslator, type TranslationKey } from "./translate";
export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  parseAppLocale,
  type AppLocale,
} from "./types";

export function initLocale(): void {
  applyDocumentLocale(loadAppSettings().locale ?? DEFAULT_LOCALE);
}
