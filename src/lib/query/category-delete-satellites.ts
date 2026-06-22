import { invalidateMindMapsCache } from "@/domains/mindmaps/mindmap-storage";
import { invalidateSourcesCache } from "@/domains/sources/sources-storage";
import { clearSubjectSettings } from "@/domains/subjects/subject-settings";
import { notifyMnemonics } from "@/domains/mnemonic";
import { emitDomainChanged } from "@/lib/event-bus";
import { invalidateExaminerProfile } from "@/lib/examiner-profile-cache";
import { backlinkIndex } from "@/lib/backlink-index";

export interface CategoryDeleteSatelliteOptions {
  categoryId: string;
  clearSubjectSettings?: boolean;
}

/** Non-core TanStack / KV cleanup after category cascade delete. */
export async function syncCategoryDeleteSatelliteCaches(
  opts: CategoryDeleteSatelliteOptions,
): Promise<void> {
  invalidateSourcesCache();
  emitDomainChanged({ domain: "zettelkasten" });
  notifyMnemonics();
  invalidateMindMapsCache();
  if (opts.clearSubjectSettings) {
    await clearSubjectSettings(opts.categoryId);
  }
  invalidateExaminerProfile(opts.categoryId);
  backlinkIndex.clear(opts.categoryId);
}
