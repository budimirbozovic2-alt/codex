/**
 * Primitive Zod helpers shared by all backup sub-schemas.
 *
 * All helpers are `.optional()` so missing fields don't trigger Zod v4
 * "nonoptional" errors; the transform supplies the default.
 */
import { z } from "zod";
import { sanitizeHtml } from "@/lib/sanitize";
import type { EditorDoc } from "@/lib/editor-v4/types";

const EMPTY_DOC: EditorDoc = { version: 4, content: { type: "doc", content: [] } };

/** Canonical v4 EditorDoc — required on all v7 backup bodies. */
export const EditorDocV4 = z
  .unknown()
  .transform((v): EditorDoc => {
    const doc = v as { version?: number; content?: unknown };
    if (doc?.version === 4 && doc.content) return doc as EditorDoc;
    return EMPTY_DOC;
  });

/** Coerce a value to string and run it through DOMPurify. */
export const SafeHtml = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "string" ? sanitizeHtml(v) : ""));

/** Plain string fallback (no HTML allowed — strip angle brackets). */
export const SafeText = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "string" ? v.replace(/[<>]/g, "") : ""));

export const NumberWithDefault = (def: number) =>
  z.unknown().optional().transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : def));

export const NullableNumber = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));

export const StringArray = z
  .unknown()
  .optional()
  .transform((v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []));

export const FrequencyTagSchema = z
  .unknown()
  .optional()
  .transform((v) => (v === "često" || v === "rijetko" || v === "nikad" ? v : undefined));

export const SourceTypeSchema = z
  .unknown()
  .optional()
  .transform((v) => (v === "skripta" || v === "zakon" ? v : undefined));

/**
 * Per-item lenient parser: validates each row, drops invalid ones (logs in dev).
 * Used for satellite log arrays so one corrupt row doesn't abort the whole restore.
 */
export function lenientArray<T extends z.ZodTypeAny>(schema: T, label: string) {
  return z
    .unknown()
    .optional()
    .transform((v): z.infer<T>[] => {
      if (!Array.isArray(v)) return [];
      const out: z.infer<T>[] = [];
      let dropped = 0;
      let firstErr: string | undefined;
      for (const raw of v) {
        const r = schema.safeParse(raw);
        if (r.success) {
          out.push(r.data);
        } else {
          dropped++;
          if (!firstErr) {
            const issue = r.error.issues[0];
            firstErr = `${issue?.path.join(".") || "(root)"} — ${issue?.message ?? ""}`;
          }
        }
      }
      if (dropped > 0) {
        // PR-H1: route through central logger so schema warnings respect
        // the same prod-suppression contract as the rest of the app.
        void import("@/lib/logger").then(({ logger }) => {
          logger.warn(`[backup-schema] ${label}: dropped ${dropped} invalid row(s). First: ${firstErr}`);
        });
      }
      return out;
    });
}
