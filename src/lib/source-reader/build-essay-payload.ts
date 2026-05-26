/**
 * Source-Reader Essay Payload Builders — pure domain.
 *
 * Centralizes the construction of `addCard`/`patchCard` arguments for the
 * three mapping flows (smart-split separate, smart-split combined, exam
 * mapping, link-to-existing). No React, no IDB.
 */
import { sanitizeHtml } from "@/lib/sanitize";
import { createSection, type Card, type SourceModule } from "@/lib/spaced-repetition";
import { createTextAnchor, type Source } from "@/lib/sources-storage";
import { splitSelection, type SelectionModule } from "@/lib/selection-split-engine";
import {
  buildSeparatePlans, buildCombinedPlan,
  type SeparateCardPlan, type CombinedCardPlan, type WizardModuleEdit,
} from "@/lib/split-wizard-build";
import { htmlToDoc, type EditorDoc } from "@/lib/editor-v4";
import { logger } from "@/lib/logger";

/**
 * Convert sanitized section HTML into its canonical V4 AST.
 *
 * Smart-Split keeps producing plain text + sanitized HTML per the Smart-Split
 * Wizard rule (manual text input remains the SSOT for module detection); we
 * additionally seed `contentDoc` so the section persists in the new schema
 * immediately and doesn't have to wait for the lazy-migrate pass.
 */
function buildSectionDoc(html: string): EditorDoc | undefined {
  try {
    return htmlToDoc(html);
  } catch (err) {
    logger.warn("[build-essay-payload] htmlToDoc failed; section persists with legacy HTML only", err);
    return undefined;
  }
}

export interface AddCardArgs {
  question: string;
  sections: { title: string; content: string; contentDoc?: EditorDoc }[];
  categoryId: string;
  subId?: string;
  chapId?: string;
  options?: {
    sourceId?: string;
    textAnchor?: string;
    originalSourceSnippet?: string;
    childCardIds?: string[];
    sourceModules?: SourceModule[];
    tags?: string[];
  };
}

function fromSeparatePlan(plan: SeparateCardPlan, source: Source, subId?: string, chapId?: string): AddCardArgs {
  const content = sanitizeHtml(plan.module.contentHtml);
  return {
    question: plan.question,
    sections: [{ title: "Odgovor", content, contentDoc: buildSectionDoc(content) }],
    categoryId: source.categoryId,
    subId,
    chapId,
    options: {
      sourceId: source.id,
      textAnchor: createTextAnchor(plan.module.plainSnippet),
      originalSourceSnippet: plan.module.plainSnippet,
      tags: plan.tags.length > 0 ? plan.tags : undefined,
    },
  };
}

export function buildSeparateEssaysFromModules(
  modules: ReadonlyArray<SelectionModule>,
  edits: ReadonlyArray<WizardModuleEdit>,
  source: Source,
  subId?: string,
  chapId?: string,
): AddCardArgs[] {
  return buildSeparatePlans(modules, edits).map((p) => fromSeparatePlan(p, source, subId, chapId));
}

function fromCombinedPlan(plan: CombinedCardPlan, source: Source, subId?: string, chapId?: string): AddCardArgs {
  const sections = plan.modules.map(({ question, module: mod }) => {
    const content = sanitizeHtml(mod.contentHtml);
    return { title: question, content, contentDoc: buildSectionDoc(content) };
  });
  const sourceModules: SourceModule[] = plan.modules.map(({ question, module: mod }, index) => ({
    id: crypto.randomUUID(),
    order: index,
    articleNum: mod.articleNum,
    title: question,
    question,
    textAnchor: createTextAnchor(mod.plainSnippet),
    originalSourceSnippet: mod.plainSnippet,
  }));
  const combinedSnippet = plan.modules.map(({ module: mod }) => mod.plainSnippet).join("\n\n");
  return {
    question: plan.parentName,
    sections,
    categoryId: source.categoryId,
    subId,
    chapId,
    options: {
      sourceId: source.id,
      textAnchor: createTextAnchor(combinedSnippet),
      originalSourceSnippet: combinedSnippet,
      childCardIds: sourceModules.map((m) => m.id),
      sourceModules,
      tags: plan.tags.length > 0 ? plan.tags : undefined,
    },
  };
}

export function buildCombinedEssayFromModules(
  modules: ReadonlyArray<SelectionModule>,
  edits: ReadonlyArray<WizardModuleEdit>,
  parentName: string,
  source: Source,
  subId?: string,
  chapId?: string,
): AddCardArgs | null {
  const plan = buildCombinedPlan(modules, edits, parentName);
  if (!plan) return null;
  return fromCombinedPlan(plan, source, subId, chapId);
}

export interface ExamMappingResult {
  args: AddCardArgs;
  moduleCount: number;
  rangeLabel?: string;
}

/**
 * Builds the addCard payload for an exam-question mapping. Re-runs
 * `splitSelection` to detect Član boundaries; falls back to a single-section
 * essay when none are found.
 */
export function buildEssayFromSelection(
  text: string,
  html: string,
  questionText: string,
  source: Source,
): ExamMappingResult {
  const result = splitSelection(text);
  if (result.hasArticles && result.modules.length > 0) {
    const { modules } = result;
    const sections = modules.map((mod) => {
      const content = sanitizeHtml(mod.contentHtml);
      return { title: mod.title, content, contentDoc: buildSectionDoc(content) };
    });
    const sourceModules: SourceModule[] = modules.map((mod, index) => ({
      id: crypto.randomUUID(),
      order: index,
      articleNum: mod.articleNum,
      title: mod.title,
      question: mod.title,
      textAnchor: createTextAnchor(mod.plainSnippet),
      originalSourceSnippet: mod.plainSnippet,
    }));
    const combinedSnippet = modules.map((m) => m.plainSnippet).join("\n\n");
    return {
      args: {
        question: questionText,
        sections,
        categoryId: source.categoryId,
        options: {
          sourceId: source.id,
          textAnchor: createTextAnchor(combinedSnippet),
          originalSourceSnippet: combinedSnippet,
          childCardIds: sourceModules.map((m) => m.id),
          sourceModules,
        },
      },
      moduleCount: modules.length,
      rangeLabel: result.rangeLabel,
    };
  }
  const fallbackContent = sanitizeHtml(html || text);
  return {
    args: {
      question: questionText,
      sections: [{ title: "Odgovor", content: fallbackContent, contentDoc: buildSectionDoc(fallbackContent) }],
      categoryId: source.categoryId,
      options: {
        sourceId: source.id,
        textAnchor: createTextAnchor(text),
        originalSourceSnippet: text,
      },
    },
    moduleCount: 1,
  };
}

export function buildLinkPatch(
  card: Card,
  snippetText: string,
  snippetHtml: string,
  sourceId: string,
  appendSnippet: boolean,
): Card {
  const base: Card = {
    ...card,
    sourceId,
    textAnchor: createTextAnchor(snippetText),
    originalSourceSnippet: snippetText,
  };
  if (!appendSnippet) return base;
  return {
    ...base,
    sections: [
      ...card.sections,
      createSection("Isječak iz izvora", htmlToDoc(sanitizeHtml(snippetHtml || snippetText))),
    ],
  };
}
