// ─── Domain types extracted from db-schema (A1c-4 prep) ──────────────────
//
// Dexie-free type-only module. Everything UI/business-layer code references
// (CategoryRecord, Source, MindMapDoc, KnowledgeBaseArticle, etc.) lives
// here and is re-exported from `db-schema.ts` for backwards compat until
// the final Dexie drop lands.
//
// Adding a new domain interface? Put it here, not in db-schema.ts.

import type { CSSProperties, ReactNode } from "react";
import type { EditorDoc } from "./editor-v4/types";

// ─── Taxonomy ────────────────────────────────────────────────────────────

export interface ChapterNode {
  id: string;
  name: string;
  sortOrder: number;
}

export interface SubcategoryNode {
  id: string;
  name: string;
  chapters: ChapterNode[];
  sortOrder: number;
}

export type ExaminerDifficulty = "tezak" | "lak";
export type PreferredAnswerType = "esej" | "definicija" | "potpitanja";

export interface ExaminerProfile {
  difficulty?: ExaminerDifficulty;
  preferredAnswerType?: PreferredAnswerType;
  notes?: string;
  updatedAt?: number;
}

export interface CategoryRecord {
  id: string;
  name: string;
  sortOrder: number;
  subcategories: SubcategoryNode[];
  color?: string;
  examinerProfile?: ExaminerProfile;
}

// ─── Sources ─────────────────────────────────────────────────────────────

export interface SourceArticle {
  id: string;
  number: number;
  title: string;
  text: string;
}

export type SourceKind = "propis" | "skripta";

export interface ExamQuestion {
  id: string;
  text: string;
  done: boolean;
  moduleCount?: number;
}

export interface Source {
  id: string;
  categoryId: string;
  title: string;
  date: string;
  /**
   * @deprecated Legacy HTML mirror. No production code reads/writes this —
   * `contentDoc` is the sole body SSOT. Kept optional only for legacy IDB
   * rows and pre-existing test fixtures.
   */
  htmlContent?: string;
  contentDoc: EditorDoc;
  outline: { id: string; text: string; level: number }[];
  articles: SourceArticle[];
  version: number;
  createdAt: number;
  updatedAt: number;
  officialGazetteInfo?: string;
  slMarkings?: string;
  isExclusive?: boolean;
  sourceKind?: SourceKind;
  examQuestions?: ExamQuestion[];
}

// ─── Mind maps ───────────────────────────────────────────────────────────

export type MindMapMode = "hierarchy" | "procedure";

export interface MindMapNodeData {
  label?: string;
  shape?: string;
  colorTheme?: string;
  [key: string]: unknown;
}

export interface MindMapNodeRecord {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: MindMapNodeData;
  style?: CSSProperties;
  [key: string]: unknown;
}

export interface MindMapEdgeRecord {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: ReactNode;
  style?: CSSProperties;
  animated?: boolean;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MindMapDoc {
  id: string;
  categoryId?: string;
  title: string;
  mode: MindMapMode;
  nodes: MindMapNodeRecord[];
  edges: MindMapEdgeRecord[];
  createdAt: number;
  updatedAt: number;
}

// ─── Zettelkasten knowledge base ─────────────────────────────────────────

export interface KnowledgeBaseArticle {
  id: string;
  subjectId: string;
  title: string;
  contentDoc: EditorDoc;
  linkedSourceIds: string[];
  rootSubcategoryId?: string;
  isIndex?: boolean;
  tags?: string[];
  aliases?: string[];
  createdAt: number;
  updatedAt: number;
  /** @deprecated Legacy markdown/HTML content. Use `contentDoc` (AST). Kept for IDB rows + test fixtures. */
  content?: string;
}

// ─── Draft autosave ──────────────────────────────────────────────────────

export interface DraftRecord {
  key: string;
  source: string;
  payload: unknown;
  updatedAt: number;
}
