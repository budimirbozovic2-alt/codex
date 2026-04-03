import { useCallback } from "react";
import { sr } from "./sr";

type NestedKeys<T, Prefix extends string = ""> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? NestedKeys<T[K], `${Prefix}${K}.`>
        : `${Prefix}${K}`;
    }[keyof T & string]
  : never;

export type TKey = NestedKeys<typeof sr>;

function getNestedValue(obj: any, path: string): string {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null) return path;
    current = current[part];
  }
  return typeof current === "string" ? current : path;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = params[key];
    return val != null ? String(val) : `{${key}}`;
  });
}

/**
 * Hook za pristup centralizovanom rječniku.
 *
 * ```tsx
 * const t = useT();
 * t("common.save")                    // "Sačuvaj"
 * t("dashboard.ofTotal", { count: 5 }) // "od 5 ukupno"
 * ```
 */
export function useT() {
  return useCallback((key: string, params?: Record<string, string | number>): string => {
    const raw = getNestedValue(sr, key);
    return interpolate(raw, params);
  }, []);
}

/**
 * Non-hook version for use outside React components (e.g., in constants, utility functions).
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const raw = getNestedValue(sr, key);
  return interpolate(raw, params);
}
