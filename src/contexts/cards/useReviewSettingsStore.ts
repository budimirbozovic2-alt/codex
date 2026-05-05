// M1 decomposition — review-log + SR-settings store extracted from
// CardStateProvider. Owns the in-memory copies and routes writes through
// the dedicated repositories.
import { useCallback, useState } from "react";
import { DEFAULT_SR_SETTINGS, type SRSettings } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/storage";
import { reviewLogRepository } from "@/lib/repositories/reviewLogRepository";
import { settingsRepository } from "@/lib/repositories/settingsRepository";

export interface ReviewSettingsStore {
  reviewLog: ReviewLogEntry[];
  srSettings: SRSettings;
  setReviewLogState: React.Dispatch<React.SetStateAction<ReviewLogEntry[]>>;
  setSrSettingsState: React.Dispatch<React.SetStateAction<SRSettings>>;
  commitReviewEntry: (entry: ReviewLogEntry) => void;
  commitReviewEntries: (entries: ReviewLogEntry[]) => void;
  setReviewLog: (updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]) => void;
  replaceReviewLog: (log: ReviewLogEntry[]) => void;
  updateSRSettings: (settings: SRSettings) => void;
}

export function useReviewSettingsStore(): ReviewSettingsStore {
  const [reviewLog, setReviewLogState] = useState<ReviewLogEntry[]>([]);
  const [srSettings, setSrSettingsState] = useState<SRSettings>(DEFAULT_SR_SETTINGS);

  const commitReviewEntry = useCallback((entry: ReviewLogEntry) => {
    setReviewLogState((prev) => [...prev, entry]);
    reviewLogRepository.append(entry);
  }, []);

  const commitReviewEntries = useCallback((entries: ReviewLogEntry[]) => {
    if (entries.length === 0) return;
    setReviewLogState((prev) => [...prev, ...entries]);
    reviewLogRepository.appendMany(entries);
  }, []);

  const setReviewLog = useCallback(
    (updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]) => {
      setReviewLogState((prev) => updater(prev));
    },
    [],
  );

  const replaceReviewLog = useCallback((log: ReviewLogEntry[]) => {
    setReviewLogState(log);
  }, []);

  const updateSRSettings = useCallback((settings: SRSettings) => {
    setSrSettingsState(settings);
    void settingsRepository.save("srSettings", settings);
  }, []);

  return {
    reviewLog,
    srSettings,
    setReviewLogState,
    setSrSettingsState,
    commitReviewEntry,
    commitReviewEntries,
    setReviewLog,
    replaceReviewLog,
    updateSRSettings,
  };
}
