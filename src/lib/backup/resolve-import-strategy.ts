import type { ImportStrategy } from "@/components/export-import/types";

interface StrategyInput {
  type: string;
  hasProgress: boolean;
  existingCardsCount: number;
}

/** Pick default merge strategy for import-confirm (no conflict UI). */
export function resolveAutoImportStrategy(input: StrategyInput): ImportStrategy {
  if (input.type === "template") return "keep";
  if (input.hasProgress && input.existingCardsCount === 0) return "overwrite";
  return "keep";
}
