/**
 * Source-Reader Essay Payload Builders — pure domain.
 *
 * Centralizes the construction of `addCard`/`patchCard` arguments for the
 * three mapping flows (smart-split separate, smart-split combined, exam
 * mapping, link-to-existing). No React, no storage I/O.
 */
import { sanitizeHtml } from "@/lib/sanitize";
import { createSection, type Card, type SourceModule } from "@/lib/spaced-repetition";
import { createTextAnchor, type Source } from "@/domains/sources/sources-storage";
import { splitSelection, stripTitleFromContent, stripTitleFromDoc, htmlToPlain, type SelectionModule } from "@/lib/selection-split-engine";
import {
  buildSeparatePlans, buildCombinedPlan,
  type SeparateCardPlan, type CombinedCardPlan, type WizardModuleEdit,
} from "@/lib/split-wizard-build";
import { docToHtml, htmlToDoc, type EditorDoc } from "@/lib/editor-v4";
import { logger } from "@/lib/logger";
import {
  normalizeQuestionTitle,
  normalizeWizardEdits,
  sourceKindToCardSourceType,
} from "@/lib/source-reader/prepare-wizard-modules";
import type { CardSourceType } from "@/lib/spaced-repetition";

/**
 * Convert sanitized section HTML into its canonical V4 AST.
 *
 * Smart-Split keeps producing plain text + sanitized HTML per the Smart-Split
 * Wizard rule (manual text input remains the SSOT for module detection); we
 * additionally seed `contentDoc` so the section persists in the new schema
 * immediately (boot migration handles any remaining legacy rows).
 */
function buildSectionDoc(html: string): EditorDoc | undefined {
  try {
    return htmlToDoc(html);
  } catch (err) {
    logger.warn("[build-essay-payload] htmlToDoc failed; section persists with legacy HTML only", err);
    return undefined;
  }
}

function resolveSectionDoc(mod: SelectionModule, html: string): EditorDoc {
  if (mod.contentDoc) return mod.contentDoc;
  return buildSectionDoc(html) ?? htmlToDoc(sanitizeHtml(html));
}

export interface AddCardArgs {
  question: string;
  sections: { title: string; contentDoc: EditorDoc }[];
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
    sourceType?: CardSourceType;
  };
}

function cardOptionsFromSource(
  source: Source,
  extra: Omit<NonNullable<AddCardArgs["options"]>, "sourceType"> & { sourceType?: CardSourceType },
): NonNullable<AddCardArgs["options"]> {
  return {
    ...extra,
    sourceId: source.id,
    sourceType: extra.sourceType ?? sourceKindToCardSourceType(source.sourceKind),
  };
}

function strippedModuleHtml(title: string, mod: SelectionModule): string {
  const { contentHtml } = stripTitleFromContent(
    normalizeQuestionTitle(title),
    mod.contentText,
    mod.contentHtml,
  );
  return sanitizeHtml(contentHtml);
}

function fromSeparatePlan(plan: SeparateCardPlan, source: Source, subId?: string, chapId?: string): AddCardArgs {
  const question = normalizeQuestionTitle(plan.question);
  const content = strippedModuleHtml(plan.question, plan.module);
  return {
    question,
    sections: [{ title: "Odgovor", contentDoc: resolveSectionDoc(plan.module, content) }],
    categoryId: source.categoryId,
    subId,
    chapId,
    options: cardOptionsFromSource(source, {
      textAnchor: createTextAnchor(plan.module.plainSnippet),
      originalSourceSnippet: plan.module.plainSnippet,
      tags: plan.tags.length > 0 ? plan.tags : undefined,
    }),
  };
}

export function buildSeparateEssaysFromModules(
  modules: ReadonlyArray<SelectionModule>,
  edits: ReadonlyArray<WizardModuleEdit>,
  source: Source,
  subId?: string,
  chapId?: string,
): AddCardArgs[] {
  return buildSeparatePlans(modules, normalizeWizardEdits(edits)).map((p) => fromSeparatePlan(p, source, subId, chapId));
}

function fromCombinedPlan(plan: CombinedCardPlan, source: Source, subId?: string, chapId?: string): AddCardArgs {
  const sections = plan.modules.map(({ question, module: mod }) => {
    const title = normalizeQuestionTitle(question);
    const content = strippedModuleHtml(question, mod);
    return { title, contentDoc: resolveSectionDoc(mod, content) };
  });
  const sourceModules: SourceModule[] = plan.modules.map(({ question, module: mod }, index) => {
    const title = normalizeQuestionTitle(question);
    return {
      id: crypto.randomUUID(),
      order: index,
      articleNum: mod.articleNum,
      title,
      question: title,
      textAnchor: createTextAnchor(mod.plainSnippet),
      originalSourceSnippet: mod.plainSnippet,
    };
  });
  const combinedSnippet = plan.modules.map(({ module: mod }) => mod.plainSnippet).join("\n\n");
  const parentName = normalizeQuestionTitle(plan.parentName);
  return {
    question: parentName,
    sections,
    categoryId: source.categoryId,
    subId,
    chapId,
    options: cardOptionsFromSource(source, {
      textAnchor: createTextAnchor(combinedSnippet),
      originalSourceSnippet: combinedSnippet,
      childCardIds: sourceModules.map((m) => m.id),
      sourceModules,
      tags: plan.tags.length > 0 ? plan.tags : undefined,
    }),
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
  const plan = buildCombinedPlan(modules, normalizeWizardEdits(edits), normalizeQuestionTitle(parentName));
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
  selectionDoc?: EditorDoc,
): ExamMappingResult {
  const question = normalizeQuestionTitle(questionText);
  const tryArticleSplit = source.sourceKind !== "skripta";
  const result = tryArticleSplit ? splitSelection(text) : { hasArticles: false, modules: [], rangeLabel: "", parentName: "" };
  if (result.hasArticles && result.modules.length > 0) {
    const { modules } = result;
    const sections = modules.map((mod) => {
      const title = normalizeQuestionTitle(mod.title);
      const content = strippedModuleHtml(mod.title, mod);
      return { title, contentDoc: resolveSectionDoc(mod, content) };
    });
    const sourceModules: SourceModule[] = modules.map((mod, index) => {
      const title = normalizeQuestionTitle(mod.title);
      return {
        id: crypto.randomUUID(),
        order: index,
        articleNum: mod.articleNum,
        title,
        question: title,
        textAnchor: createTextAnchor(mod.plainSnippet),
        originalSourceSnippet: mod.plainSnippet,
      };
    });
    const combinedSnippet = modules.map((m) => m.plainSnippet).join("\n\n");
    return {
      args: {
        question,
        sections,
        categoryId: source.categoryId,
        options: cardOptionsFromSource(source, {
          textAnchor: createTextAnchor(combinedSnippet),
          originalSourceSnippet: combinedSnippet,
          childCardIds: sourceModules.map((m) => m.id),
          sourceModules,
        }),
      },
      moduleCount: modules.length,
      rangeLabel: result.rangeLabel,
    };
  }
  const safeHtml = sanitizeHtml(html || text);
  const fallbackDoc = selectionDoc ?? buildSectionDoc(safeHtml) ?? htmlToDoc(safeHtml);
  const strippedDoc = stripTitleFromDoc(question, fallbackDoc);
  return {
    args: {
      question,
      sections: [{ title: "Odgovor", contentDoc: strippedDoc }],
      categoryId: source.categoryId,
      options: cardOptionsFromSource(source, {
        textAnchor: createTextAnchor(htmlToPlain(docToHtml(strippedDoc)) || text),
        originalSourceSnippet: htmlToPlain(docToHtml(strippedDoc)) || text,
      }),
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
  snippetDoc?: EditorDoc,
): Card {
  const base: Card = {
    ...card,
    sourceId,
    textAnchor: createTextAnchor(snippetText),
    originalSourceSnippet: snippetText,
  };
  if (!appendSnippet) return base;
  const sectionDoc = snippetDoc ?? htmlToDoc(sanitizeHtml(snippetHtml || snippetText));
  return {
    ...base,
    sections: [
      ...card.sections,
      createSection("Isječak iz izvora", sectionDoc),
    ],
  };
}
