/**

 * TanStack cache for review log + global SR settings.

 */

import { DEFAULT_SR_SETTINGS, type SRSettings } from "@/lib/spaced-repetition";

import type { ReviewLogEntry } from "@/lib/storage";

import { settingsRepository, reviewLogRepository } from "@/lib/repositories";

import { emitDomainChanged } from "@/lib/event-bus";

import { queryClient } from "./client";

import { queryKeys } from "./keys";



export const REVIEW_LOG_BOOT_DAYS = 90;

const REVIEW_LOG_CAP = 5000;



let reviewLogWriteGeneration = 0;



export function resetReviewSettingsQueryCache(): void {

  queryClient.removeQueries({ queryKey: queryKeys.review.root });

  queryClient.removeQueries({ queryKey: queryKeys.settings.root });

}



export function getReviewLogCacheWriteGeneration(): number {

  return reviewLogWriteGeneration;

}



export function beginReviewLogWrite(): number {

  reviewLogWriteGeneration += 1;

  void queryClient.cancelQueries({ queryKey: queryKeys.review.root });

  return reviewLogWriteGeneration;

}



export function seedReviewLogCache(

  entries: readonly ReviewLogEntry[],

  days: number = REVIEW_LOG_BOOT_DAYS,

  writeGen?: number,

): boolean {

  if (writeGen !== undefined && writeGen !== reviewLogWriteGeneration) {

    return false;

  }

  queryClient.setQueryData(queryKeys.review.logRecent(days), [...entries]);

  return true;

}



export function seedSrSettingsCache(settings: SRSettings): void {

  queryClient.setQueryData(queryKeys.settings.sr(), settings);

}



export async function commitReviewLogFromDb(

  days: number = REVIEW_LOG_BOOT_DAYS,

  writeGen?: number,

): Promise<number> {

  const entries = await reviewLogRepository.loadRecent(days);

  if (writeGen !== undefined) {

    if (!seedReviewLogCache(entries, days, writeGen)) return -1;

  } else {

    seedReviewLogCache(entries, days);

  }

  emitDomainChanged({ domain: "review", kind: "replace" });

  return entries.length;

}



export async function abortReviewLogWrite(

  days: number = REVIEW_LOG_BOOT_DAYS,

): Promise<number> {

  return commitReviewLogFromDb(days);

}



export function appendReviewLogOptimistic(entry: ReviewLogEntry): void {

  const key = queryKeys.review.logRecent(REVIEW_LOG_BOOT_DAYS);

  const prev =

    queryClient.getQueryData<ReviewLogEntry[]>(key) ?? [];

  const next = [...prev, entry];

  queryClient.setQueryData(

    key,

    next.length > REVIEW_LOG_CAP ? next.slice(-REVIEW_LOG_CAP) : next,

  );

}



export function replaceReviewLogCache(

  entries: readonly ReviewLogEntry[],

  days: number = REVIEW_LOG_BOOT_DAYS,

): void {

  queryClient.setQueryData(queryKeys.review.logRecent(days), [...entries]);

  emitDomainChanged({ domain: "review", kind: "replace" });

}



export function getSrSettingsSnapshot(): SRSettings {

  return (

    queryClient.getQueryData<SRSettings>(queryKeys.settings.sr()) ??

    DEFAULT_SR_SETTINGS

  );

}



export async function commitSrSettings(settings: SRSettings): Promise<void> {

  const prev = getSrSettingsSnapshot();

  queryClient.setQueryData(queryKeys.settings.sr(), settings);

  try {

    await settingsRepository.save("srSettings", settings);

    emitDomainChanged({ domain: "settings", kind: "sr" });

  } catch (err) {

    queryClient.setQueryData(queryKeys.settings.sr(), prev);

    throw err;

  }

}



/** Fire-and-forget wrapper — prefer `commitSrSettings` when errors matter. */

export function updateSrSettings(settings: SRSettings): void {

  void commitSrSettings(settings);

}


