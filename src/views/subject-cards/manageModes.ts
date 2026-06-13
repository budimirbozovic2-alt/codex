import { LayoutList, Network, type LucideIcon } from "lucide-react";

/**
 * Stable internal IDs for the segmented switch inside the
 * "Uređivanje i raspored kartica" tab. These string values are persisted
 * in `sessionStorage` snapshots — DO NOT rename without a migration.
 */
export const MANAGE_MODE = {
  Edit: "edit",
  Structure: "structure",
} as const;

export type ManageMode = typeof MANAGE_MODE[keyof typeof MANAGE_MODE];

export interface ManageModeDescriptor {
  /** Stable internal key — used in logic, comparisons, and persistence. */
  id: ManageMode;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Primary visible label (Bosnian/Serbian). */
  label: string;
  /** Short visual hint shown next to the label, e.g. "View" / "Org". */
  shortTag: string;
  /** Long description used for `title` and `aria-label` tooltips. */
  tooltip: string;
}

/**
 * Single source of truth for the segmented switch. The component renders
 * by mapping over this array; ordering here defines visual order.
 */
export const MANAGE_MODES: readonly ManageModeDescriptor[] = [
  {
    id: MANAGE_MODE.Edit,
    icon: LayoutList,
    label: "Pregled i uređivanje",
    shortTag: "View",
    tooltip: "Pregled i uređivanje kartica — lista, pretraga, filteri",
  },
  {
    id: MANAGE_MODE.Structure,
    icon: Network,
    label: "Struktura i raspored",
    shortTag: "Org",
    tooltip: "Struktura i raspored kartica — hijerarhija, glave, drag & drop",
  },
] as const;

const MANAGE_MODE_BY_ID: Record<ManageMode, ManageModeDescriptor> =
  MANAGE_MODES.reduce((acc, m) => {
    acc[m.id] = m;
    return acc;
  }, {} as Record<ManageMode, ManageModeDescriptor>);

export const DEFAULT_MANAGE_MODE: ManageMode = MANAGE_MODE.Edit;

/** Type-guard that protects against corrupted snapshots from older sessions. */
export function isManageMode(value: unknown): value is ManageMode {
  return typeof value === "string" && value in MANAGE_MODE_BY_ID;
}
