import { Card } from "@/lib/spaced-repetition";
import { LearnCardProgress, ReviewLogEntry } from "@/lib/storage";
import type { CategoryRecord } from "@/lib/db";

export type { LearnCardProgress };

export type SortMode = "order" | "weakest" | "leastRead";
export type ViewWidth = "compact" | "normal" | "wide" | "full";
export type SetupStep = "filter" | "ready";

export const viewWidthClasses: Record<ViewWidth, string> = {
  compact: "max-w-xl",
  normal: "max-w-2xl",
  wide: "max-w-4xl",
  full: "max-w-full",