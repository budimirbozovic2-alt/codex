/**
 * Smart-Split wizard commit helpers — pure domain.
 *
 * Normalizes user-edited module titles (plain text, no `<p>` wrappers) and
 * maps source taxonomy onto card metadata before persistence.
 */
import type { SourceKind } from "@/lib/db-types";
import type { CardSourceType } from "@/lib/spaced-repetition";
import { htmlToPlain } from "@/lib/selection-split-engine";
import type { WizardModuleEdit } from "@/lib/split-wizard-build";

/** Strip editor HTML wrappers; collapse whitespace for card question/section titles. */
export function normalizeQuestionTitle(raw: string): string {
  const plain = htmlToPlain(raw).replace(/\s+/g, " ").trim();
  return plain;
}

/** Normalize every wizard edit question before buildCombined/Separate plans run. */
export function normalizeWizardEdits(
  edits: readonly WizardModuleEdit[],
): WizardModuleEdit[] {
  return edits.map((e) => ({
    ...e,
    question: normalizeQuestionTitle(e.question),
  }));
}

/** Map `Source.sourceKind` onto denormalized `cards.sourceType`. */
export function sourceKindToCardSourceType(
  kind: SourceKind | undefined,
): CardSourceType | undefined {
  if (kind === "skripta") return "skripta";
  if (kind === "propis") return "zakon";
  return undefined;
}
