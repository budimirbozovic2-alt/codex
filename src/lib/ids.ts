// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — Branded ID types.
//
// Goal: turn opaque `string` UUIDs into nominal types so the type-checker
// catches "wrong id family" bugs (e.g. passing a CardId where a CategoryId is
// expected) WITHOUT runtime cost and WITHOUT breaking the large body of
// existing call sites that pass plain `string`.
//
// Strategy
// --------
// • `CategoryId`, `SubcategoryId`, `ChapterId`, `CardId`, `SourceId` are
//   `string & { readonly __brand }` — true nominal subtypes of `string`.
// • Public function signatures use the `*Like` aliases (`CategoryId | string`)
//   so existing code that already passes plain string keeps compiling.
//   New code that has gone through a converter gets the tighter brand for
//   propagation downstream.
// • `asCategoryId(x)`, `asCardId(x)`, … are the *edge converters*. They run a
//   lightweight UUID-shape check (covers RFC-4122 UUIDs + our `legacy-…`
//   deterministic ids from `src/lib/stable-id.ts`) and assert the brand.
// • `isCategoryId(x)`, … are type guards for narrowing in conditional flows.
//
// Runtime behaviour: identical to passing a string. The brand exists only
// at compile time. No `JSON.stringify`-visible field is added.
// ─────────────────────────────────────────────────────────────────────────────

// ── Brand machinery ────────────────────────────────────────────────────────

declare const __categoryId: unique symbol;
declare const __subcategoryId: unique symbol;
declare const __chapterId: unique symbol;
declare const __cardId: unique symbol;
declare const __sourceId: unique symbol;

export type CategoryId    = string & { readonly [__categoryId]: "CategoryId" };
export type SubcategoryId = string & { readonly [__subcategoryId]: "SubcategoryId" };
export type ChapterId     = string & { readonly [__chapterId]: "ChapterId" };
export type CardId        = string & { readonly [__cardId]: "CardId" };
export type SourceId      = string & { readonly [__sourceId]: "SourceId" };

/**
 * "Input" aliases accepted by public APIs. Because brands extend `string`,
 * `CategoryId | string` collapses to `string` at the type level — but kept
 * explicit here as documentation: "this slot is semantically a CategoryId,
 * any string is tolerated for backwards-compat".
 */
export type CategoryIdLike    = CategoryId    | string;
export type SubcategoryIdLike = SubcategoryId | string;
export type ChapterIdLike     = ChapterId     | string;
export type CardIdLike        = CardId        | string;
export type SourceIdLike      = SourceId      | string;

// ── UUID-shape validation ──────────────────────────────────────────────────
// Accepts both standard RFC-4122 UUIDs and our `legacy-…` deterministic ids
// produced by `src/lib/stable-id.ts`. Anything else is considered malformed.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_RE = /^legacy-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12,}$/i;

export function isUuidLike(value: unknown): value is string {
  return typeof value === "string" && (UUID_RE.test(value) || LEGACY_RE.test(value));
}

// ── Type guards ────────────────────────────────────────────────────────────
// All guards share the same UUID-shape predicate; the brand distinguishes
// only the *intended* family, which the type-checker enforces at use sites.
export const isCategoryId    = (v: unknown): v is CategoryId    => isUuidLike(v);
export const isSubcategoryId = (v: unknown): v is SubcategoryId => isUuidLike(v);
export const isChapterId     = (v: unknown): v is ChapterId     => isUuidLike(v);
export const isCardId        = (v: unknown): v is CardId        => isUuidLike(v);
export const isSourceId      = (v: unknown): v is SourceId      => isUuidLike(v);

// ── Edge converters ────────────────────────────────────────────────────────
// Use at parsing boundaries: URL params, IDB reads, JSON imports, form input.
// In dev, malformed values throw to surface bugs early; in prod they pass
// through (logging once) so a single dirty record can't crash the app.

const DEV = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
const _warned = new Set<string>();

function brand<T extends string>(family: string, value: string): T {
  if (!isUuidLike(value)) {
    const tag = `${family}:${value}`;
    if (DEV) throw new Error(`as${family}: value "${value}" is not a UUID-shaped id`);
    if (!_warned.has(tag)) {
      _warned.add(tag);
      // eslint-disable-next-line no-console
      console.warn(`[ids] non-UUID value coerced to ${family}: "${value}"`);
    }
  }
  return value as T;
}

export const asCategoryId    = (v: string): CategoryId    => brand<CategoryId>("CategoryId", v);
export const asSubcategoryId = (v: string): SubcategoryId => brand<SubcategoryId>("SubcategoryId", v);
export const asChapterId     = (v: string): ChapterId     => brand<ChapterId>("ChapterId", v);
export const asCardId        = (v: string): CardId        => brand<CardId>("CardId", v);
export const asSourceId      = (v: string): SourceId      => brand<SourceId>("SourceId", v);
