/**
 * TanStack read hooks for review log and global SR settings.
 */
import { useQuery } from "@tanstack/react-query";
import { reviewLogRepository, settingsRepository } from "@/lib/repositories";
import { DEFAULT_SR_SETTINGS, type SRSettings } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { queryKeys } from "@/lib/query/keys";
import {
  REVIEW_LOG_BOOT_DAYS,
  updateSrSettings,
} from "@/lib/query/review-settings-cache-coordinator";

const EMPTY_LOG: ReviewLogEntry[] = [];

export function useReviewLog(
  days: number = REVIEW_LOG_BOOT_DAYS,
): ReviewLogEntry[] {
  const { data } = useQuery({
    queryKey: queryKeys.review.logRecent(days),
    queryFn: () => reviewLogRepository.loadRecent(days),
    staleTime: Infinity,
  });
  return data ?? EMPTY_LOG;
}

export function useSrSettings(): SRSettings {
  const { data } = useQuery({
    queryKey: queryKeys.settings.sr(),
    queryFn: () =>
      settingsRepository.load<SRSettings>("srSettings", DEFAULT_SR_SETTINGS),
    staleTime: Infinity,
  });
  return data ?? DEFAULT_SR_SETTINGS;
}

export { updateSrSettings, REVIEW_LOG_BOOT_DAYS };
