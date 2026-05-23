import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCardExport } from "@/hooks/useCardExport";
import { useCardImport } from "@/hooks/useCardImport";
import { useCardStateInternals, useCardData, useReviewData } from "./CardStateProvider";
import { useCategoryStateInternals } from "./CategoryStateProvider";
import { missingProvider } from "./_providerFallback";

type ExportValue = ReturnType<typeof useCardExport>;
type ImportValue = ReturnType<typeof useCardImport>;

export type BackupActionsValue = ExportValue & ImportValue;

const BackupActionsContext = createContext<BackupActionsValue | null>(null);

export function useBackupActions() {
  const ctx = useContext(BackupActionsContext);
  if (!ctx) missingProvider("BackupActionsProvider", "useBackupActions");
  return ctx;
}


export function BackupActionsProvider({ children }: { children: ReactNode }) {
  const { setCardMapState, replaceReviewLog, updateSRSettings } = useCardStateInternals();
  const { setCategoryRecords } = useCategoryStateInternals();
  const { cards } = useCardData();
  const { srSettings } = useReviewData();

  const exportApi = useCardExport({ cards, srSettings });
  const importApi = useCardImport({
    setCategoryRecords, setReviewLog: replaceReviewLog, updateSRSettings, setCardMapState,
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
