import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { APP_SETTINGS_CHANGED_EVENT, loadAppSettings } from "@/lib/app-settings";
import { applyDocumentLocale } from "./document-locale";
import { createTranslator } from "./translate";
import { DEFAULT_LOCALE, type AppLocale } from "./types";
import { I18nContext, type I18nContextValue } from "./I18nContext";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => loadAppSettings().locale ?? DEFAULT_LOCALE);

  const syncFromSettings = useCallback(() => {
    setLocaleState(loadAppSettings().locale ?? DEFAULT_LOCALE);
  }, []);

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  useEffect(() => {
    const onSettingsChanged = () => syncFromSettings();
    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, onSettingsChanged);
    return () => window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, onSettingsChanged);
  }, [syncFromSettings]);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    applyDocumentLocale(next);
  }, []);

  const t = useMemo(() => createTranslator(locale), [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
