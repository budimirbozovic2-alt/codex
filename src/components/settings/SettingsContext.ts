import { createContext, useContext } from "react";
import type { SRSettings } from "@/lib/spaced-repetition";
import type { AppSettings } from "@/lib/app-settings";
import type { TTSSettings } from "@/lib/tts";
import type { CategoryRecord } from "@/lib/db-types";

export interface SettingsContextValue {
  subjectId: string | null;
  subjectName: string | null;
  isSubjectMode: boolean;
  overridesEnabled: boolean;
  setOverridesEnabled: (v: boolean) => void;
  local: SRSettings;
  setLocal: React.Dispatch<React.SetStateAction<SRSettings>>;
  app: AppSettings;
  setApp: React.Dispatch<React.SetStateAction<AppSettings>>;
  tts: TTSSettings;
  setTts: React.Dispatch<React.SetStateAction<TTSSettings>>;
  voices: SpeechSynthesisVoice[];
  categories: string[];
  subcategories: Record<string, string[]>;
  categoryRecords: CategoryRecord[];
  cardCountByCategory: Record<string, number>;
  addCategory: (name: string) => void;
  renameCategory: (oldName: string, newName: string) => void;
  deleteCategory: (name: string) => void;
  hasChanges: boolean;
  isDefault: boolean;
  handleSave: () => Promise<void>;
  handleReset: () => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettingsContext(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettingsContext must be used within SettingsProvider");
  return ctx;
}
