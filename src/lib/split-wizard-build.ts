/**
 * Split Wizard — pure builders for converting Smart-Split modules into cards.
 *
 * The wizard collected per-module overrides (custom question + tags + skip flag)
 * and a wizard-wide mode ('separate' | 'combined'). This module is the single
 * source of truth for turning that user-edited state into the actual `Card`
 * payload(s) that the source-reader hook then dispatches via `addCard` /
 * `bulkAddCards`.
 *
 * Kept pure (no React, no IDB, no toasts) so it can be unit-tested without a
 * DOM. The hook is responsible for `crypto.randomUUID()`, sanitization, and
 * persistence.
 */

import type { SelectionModule } from "@/lib/selection-split-engine";
import { normalizeTagList } from "@/lib/zettelkasten-tags";

/** Per-module overrides collected by the wizard. */
export interface WizardModuleEdit {
  /** Custom question. Falls back to the module's auto-generated `title`. */
  question: string;
  /** Raw tag inputs; will be normalized via `normalizeTagList`. */
  tags: string[];
  /**
   * If true, this module is excluded from the import. Allows the user to
   * skim through detected articles and cherry-pick only the relevant ones.
   */
  skipped: boolean;
}

export type WizardMode = "separate" | "combined";

/** Sane default override for a freshly detected module. */
export function defaultEdit(mod: SelectionModule): WizardModuleEdit {
  return { question: mod.title, tags: [], skipped: false };
}

/**
 * Plan for a single card to be created. The hook turns each plan into either
 * a fresh `addCard` call (separate mode) or a single combined `addCard` call
 * with `sourceModules` (combined mode).
 */
export interface SeparateCardPlan {
  question: string;
  tags: string[];
  module: SelectionModule;
}

export interface CombinedCardPlan {
  parentName: string;
  /** Combined parent-level tags (union of all per-module tags, deduped). */
  tags: string[];
  modules: Array<{
    /** Section/module title (per-module question override). */
    question: string;
    module: SelectionModule;
  }>;
}

/**
 * Build N independent card plans, one per non-skipped module.
 *
 * Used when the user picks "zasebne kartice" — every detected article becomes
 * its own essay card, with its own question and tag set. The original article
 * order is preserved.
 */
export function buildSeparatePlans(
  modules: readonly SelectionModule[],
  edits: readonly WizardModuleEdit[],
): SeparateCardPlan[] {
  const out: SeparateCardPlan[] = [];
  for (let i = 0; i < modules.length; i++) {
    const edit = edits[i] ?? defaultEdit(modules[i]);
    if (edit.skipped) continue;
    const question = edit.question.trim() || modules[i].title;
    out.push({
      question,
      tags: normalizeTagList(edit.tags),
      module: modules[i],
    });
  }
  return out;
}

/**
 * Build a single combined card plan with N module-sections.
 *
 * Used when the user picks "jedan esej sa modulima" — all non-skipped modules
 * become sections of one parent essay. The parent inherits the union of all
 * per-module tags so filtering by any tag still surfaces the parent.
 *
 * Returns `null` if every module was skipped (nothing to create).
 */
export function buildCombinedPlan(
  modules: readonly SelectionModule[],
  edits: readonly WizardModuleEdit[],
  parentName: string,
): CombinedCardPlan | null {
  const kept: Array<{ question: string; module: SelectionModule }> = [];
  const tagBag: string[] = [];
  for (let i = 0; i < modules.length; i++) {
    const edit = edits[i] ?? defaultEdit(modules[i]);
    if (edit.skipped) continue;
    const question = edit.question.trim() || modules[i].title;
    kept.push({ question, module: modules[i] });
    for (const t of edit.tags) tagBag.push(t);
  }
  if (kept.length === 0) return null;
  return {
    parentName: parentName.trim() || "Esej",
    tags: normalizeTagList(tagBag),
    modules: kept,
  };
}

/**
 * Returns indices of modules whose user-edited question is just the original
 * auto-title (i.e. the user has not personalized the question yet). Useful
 * for the wizard's "next unfinished" jump button.
 */
export function unfinishedIndices(
  modules: readonly SelectionModule[],
  edits: readonly WizardModuleEdit[],
): number[] {
  const out: number[] = [];
  for (let i = 0; i < modules.length; i++) {
    const edit = edits[i] ?? defaultEdit(modules[i]);
    if (edit.skipped) continue;
    if (edit.question.trim() === modules[i].title.trim()) out.push(i);
  }
  return out;
}
