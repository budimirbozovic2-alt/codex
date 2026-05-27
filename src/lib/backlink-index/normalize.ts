/**
 * Pure helpers for the backlink index: title normalization + snippet windowing.
 * No state, no React, no I/O — safe to import from anywhere.
 */
import { normalizeKey } from "../zettelkasten-wiki-link";

export const SNIPPET_PAD = 40;

export function norm(title: string): string {
  return normalizeKey(title);
}

export function snippetFor(content: string, idx: number, matchLen: number): string {
  const start = Math.max(0, idx - SNIPPET_PAD);
  const end = Math.min(content.length, idx + matchLen + SNIPPET_PAD);
  const raw = content.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + raw + (end < content.length ? "…" : "");
}
