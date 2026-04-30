import { useLocation } from "react-router-dom";
import { ActivityType } from "@/lib/metacognitive-storage";

// ─── Types ──────────────────────────────────────────────
export type View = "dashboard" | "create" | "edit" | "review" | "categories" | "learn" | "settings" | "mnemonic" | "stats" | "planner";

export const VIEW_TO_PATH: Record<View, string> = {
  dashboard: "/", create: "/create", edit: "/edit", review: "/review",
  categories: "/categories", learn: "/learn", settings: "/settings",
  mnemonic: "/mnemonics", stats: "/stats", planner: "/planner",
};

export const PATH_TO_VIEW: Record<string, View> = {};
Object.entries(VIEW_TO_PATH).forEach(([view, path]) => { PATH_TO_VIEW[path] = view as View; });

export function useCurrentView(): View {
  const { pathname } = useLocation();
  return PATH_TO_VIEW[pathname] || "dashboard";
}

export const VIEW_ACTIVITY_MAP: Partial<Record<View, ActivityType>> = {
  review: "review", learn: "learn-active", mnemonic: "mnemonic-workshop",
  create: "admin", edit: "admin", categories: "admin",
  stats: "analysis", planner: "analysis",
};
