import type { BaseEditReturnSnapshot } from "@/lib/edit-return";
import type { CardViewFiltersSnapshot } from "@/components/category/CardViewMode";
import type { ManageMode } from "@/views/subject-cards/manageModes";

export type TabValue = "manage" | "read" | "speed";

export interface EditReturnSnapshot extends BaseEditReturnSnapshot {
  tab?: TabValue;
  manageMode?: ManageMode;
  searchQuery?: string;
  /** CardViewMode internal filters — restored after edit-and-return. */
  cvSubcategory?: string;
  cvChapter?: string;
  cvType?: CardViewFiltersSnapshot["type"];
  cvFrequency?: CardViewFiltersSnapshot["frequency"];
  /** When tab is "read" or "speed", re-anchor reader to this card on return. */
  readerCardId?: string;
}
