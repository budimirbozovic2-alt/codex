/** Maps legacy `?tab=` query values to hub section paths. */
export const LEGACY_TAB_TO_SECTION: Record<string, string> = {
  algorithm: "/settings/learning",
  personalization: "/settings/app/personalization",
  workflow: "/settings/app/workflow",
  subjects: "/settings/data",
  data: "/settings/data",
  system: "/settings/data",
};
