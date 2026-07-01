import type { AppLocale } from "./types";
import { meCatalog } from "./catalogs/me";
import { enCatalog } from "./catalogs/en";

export type MessageCatalog = typeof meCatalog;

const CATALOGS: Record<AppLocale, MessageCatalog> = {
  me: meCatalog,
  // en mirrors me's structure with English strings. me/en have identical key
  // shapes but distinct string-literal types, so widen via unknown.
  en: enCatalog as unknown as MessageCatalog,
};

type Join<K extends string, P extends string> = `${K}.${P}`;

type Paths<T, D extends number = 5> = [D] extends [never]
  ? never
  : T extends object
    ? {
        [K in keyof T & string]: T[K] extends object
          ? Join<K, Paths<T[K], Prev[D]>>
          : K;
      }[keyof T & string]
    : never;

type Prev = [never, 0, 1, 2, 3, 4, 5];

export type TranslationKey = Paths<MessageCatalog>;

function getNestedValue(catalog: MessageCatalog, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = catalog;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object" || !(part in (cur as object))) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function createTranslator(locale: AppLocale) {
  const catalog = CATALOGS[locale];
  const fallback = CATALOGS.me;

  return function t(key: TranslationKey): string {
    return getNestedValue(catalog, key) ?? getNestedValue(fallback, key) ?? key;
  };
}

export function getCatalog(locale: AppLocale): MessageCatalog {
  return CATALOGS[locale];
}
