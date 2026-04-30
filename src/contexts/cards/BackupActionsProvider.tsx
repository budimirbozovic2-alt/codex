import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCardExport } from "@/hooks/useCardExport";
import { useCardImport } from "@/hooks/useCardImport";
import { useCardStateInternals, useCardData, useReviewData } from "./CardStateProvider";
import { useCategoryStateInternals } from "./CategoryStateProvider";

type ExportValue = ReturnType<typeof useCardExport>;
type ImportValue = ReturnType<typeof useCardImport>;

export type BackupActionsValue = ExportValue & ImportValue;

const BackupActionsContext = createContext<BackupActionsValue | null>(null);

export function useBackupActions() {
  const ctx = useContext(BackupActionsContext);
  if (!ctx) throw new Error("useBackupActions must be used within BackupActionsProvider");
  return ctx;
}

export function BackupActionsProvider({ children }: { children: ReactNode }) {
  const { setCardMapState, cardMapRef, setReviewLog, updateSRSettings } = useCardStateInternals();
  const { setCategoryRecords } = useCategoryStateInternals();
  const { cards } = useCardData();
  const { srSettings } = useReviewData();

  const exportApi = useCardExport({ cards, srSettings });
  const importApi = useCardImport({
    setCategoryRecords, setReviewLog, updateSRSettings, setCardMapState, cardMapRef,
  });

  const value = useMemo<BackupActionsValue>(
    () => ({ ...exportApi, ...importApi }),
    [exportApi.exportData, exportApi.exportTemplate, importApi.importData, importApi.importCards],
  );

  return (
    <BackupActionsContext.Provider value={value}>
      {children}
    </BackupActionsContext.Provider>
  );
}
