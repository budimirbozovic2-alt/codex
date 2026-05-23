import { useContext } from "react";
import { CardActionsContext, CategoryActionsContext, BackupActionsContext } from "./actions-contexts";
import { missingProvider } from "./_providerFallback";

export function useCardOnlyActions() {
  const ctx = useContext(CardActionsContext);
  if (!ctx) missingProvider("ActionsProvider", "useCardOnlyActions");
  return ctx;
}

export function useCategoryActions() {
  const ctx = useContext(CategoryActionsContext);
  if (!ctx) missingProvider("ActionsProvider", "useCategoryActions");
  return ctx;
}

export function useBackupActions() {
  const ctx = useContext(BackupActionsContext);
  if (!ctx) missingProvider("ActionsProvider", "useBackupActions");
  return ctx;
}
