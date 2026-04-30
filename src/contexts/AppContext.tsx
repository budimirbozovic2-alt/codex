// ═══════════════════════════════════════════════════════════
// COMPOSITION ROOT
// Razbijeno u domenske module — ovaj fajl samo sastavlja providere
// i re-eksportuje javne API-je da svi postojeći potrošači rade nepromijenjeno.
// ═══════════════════════════════════════════════════════════
import { ReactNode } from "react";
import { CardProvider } from "./cards/CardProvider";
import { PomodoroProvider } from "./pomodoro/PomodoroProvider";
import { UIProvider } from "./ui/UIProvider";

// ─── Public re-exports (preserve existing import paths) ──
export type { View } from "./routing/useCurrentView";
export { useCurrentView } from "./routing/useCurrentView";

export type { PomodoroState } from "./pomodoro/usePomodoroEngine";
export {
  usePomodoroStable,
  usePomodoroTick,
  usePomodoroContext,
} from "./pomodoro/PomodoroProvider";

export { useUIContext } from "./ui/UIProvider";

export {
  useCardData,
  useReviewData,
  useCategoryData,
  useCategoryStatsData,
  useCardOnlyActions,
  useCategoryActions,
  useBackupActions,
  useSettingsActions,
} from "./cards/CardProvider";

// ─── Composition root ────────────────────────────────────
export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <CardProvider>
      <PomodoroProvider>
        <UIProvider>
          {children}
        </UIProvider>
      </PomodoroProvider>
    </CardProvider>
  );
}
