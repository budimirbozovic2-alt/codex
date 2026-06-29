/**
 * TanStack cache invalidation scope types (TD-ARCH-5).
 * Decoupled from the infrastructure event bus.
 */

export type CardsChangedScope =
  | { kind: "all" }
  | { kind: "derived" }
  | { kind: "category"; categoryId: string }
  | { kind: "subcategory"; categoryId: string; subcategoryId: string }
  | { kind: "chapter"; categoryId: string; chapterId: string }
  | { kind: "source"; sourceId: string };

export type PlannerChangedKind =
  | "config"
  | "discipline"
  | "dailyMapped"
  | "lastRedistribute";

export type CategoriesChangedScope =
  | { kind: "all" }
  | { kind: "byId"; categoryId: string };
