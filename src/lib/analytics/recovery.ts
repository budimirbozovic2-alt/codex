// Thin adapter — pulls discipline log from main-thread storage and delegates.
import { loadDisciplineLog } from "../planner/discipline";
import { calcRecoveryRate as calcRecoveryRatePure, type RecoveryStats } from "./_pure/recovery";

export type { RecoveryStats };

export function calcRecoveryRate(): RecoveryStats | null {
  return calcRecoveryRatePure(loadDisciplineLog());
}
