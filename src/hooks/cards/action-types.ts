/**
 * Provider Cleanup v2 — Contexts removed. This file now exports types only.
 * The legacy `actions-contexts` path is preserved so external imports of
 * the value types compile unchanged.
 */
import type { useCardCRUD } from "@/hooks/useCardCRUD";
import type { useCardAnnotations } from "@/hooks/useCardAnnotations";
import type { useCategoryManagement } from "@/hooks/useCategoryManagement";
import type { useCardExport } from "@/hooks/useCardExport";
import type { useCardImport } from "@/hooks/useCardImport";

type CRUD = ReturnType<typeof useCardCRUD>;
type Annotations = ReturnType<typeof useCardAnnotations>;
export type CardActionsValue = CRUD & Annotations;

export type CategoryActionsValue = ReturnType<typeof useCategoryManagement>;

type ExportValue = ReturnType<typeof useCardExport>;
type ImportValue = ReturnType<typeof useCardImport>;
export type BackupActionsValue = ExportValue & ImportValue;
