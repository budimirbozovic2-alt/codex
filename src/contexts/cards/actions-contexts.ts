/**
 * Shared Context handles za action provider-e. Izdvojeno u plain modul da
 * `ActionsProvider` + thin `useCardOnlyActions / useCategoryActions /
 * useBackupActions` re-export shim-ovi dijele isti Context identitet.
 */
import { createContext } from "react";
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

export const CardActionsContext = createContext<CardActionsValue | null>(null);
export const CategoryActionsContext = createContext<CategoryActionsValue | null>(null);
export const BackupActionsContext = createContext<BackupActionsValue | null>(null);
