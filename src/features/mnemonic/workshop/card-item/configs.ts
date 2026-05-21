import {
  CheckCircle2, Brain, Sparkles, Wrench, Clock, List, MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { MnemonicStatus, HookType } from "../../mnemonic-storage";

export const STATUS_CONFIG: Record<MnemonicStatus, { label: string; icon: LucideIcon; color: string }> = {
  "new": { label: "Nova", icon: Sparkles, color: "text-muted-foreground" },
  "in-workshop": { label: "U radionici", icon: Wrench, color: "text-warning" },
  "ready": { label: "Spremna", icon: CheckCircle2, color: "text-success" },
};

export const HOOK_TYPE_CONFIG: Record<HookType, { label: string; icon: LucideIcon }> = {
  "rokovi": { label: "Rokovi", icon: Clock },
  "nabrajanja": { label: "Nabrajanja", icon: List },
  "ostalo": { label: "Ostalo", icon: MoreHorizontal },
};

export { Brain };
