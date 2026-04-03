import { LayoutDashboard, Target, Gauge, ShieldAlert, TrendingUp, Lightbulb } from "lucide-react";
import OnboardingModal, { type OnboardingSlide } from "@/components/OnboardingModal";
import { srOnboarding } from "@/lib/i18n/sr-onboarding";

export const DASHBOARD_ONBOARDING_KEY = "sr-dashboard-onboarding-seen";

const ICONS = [LayoutDashboard, Target, Gauge, ShieldAlert, TrendingUp, Lightbulb];
const ICON_COLORS = [
  "bg-primary/15 text-primary",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-destructive/15 text-destructive",
  "bg-primary/15 text-primary",
  "bg-accent-foreground/15 text-accent-foreground",
];

const SLIDES: OnboardingSlide[] = srOnboarding.dashboard.slides.map((slide, i) => ({
  icon: ICONS[i],
  iconColor: ICON_COLORS[i],
  title: slide.title,
  content: slide.content,
  bullets: [...slide.bullets],
}));

export default function DashboardOnboarding({ onComplete }: { onComplete: () => void }) {
  return (
    <OnboardingModal
      slides={SLIDES}
      storageKey={DASHBOARD_ONBOARDING_KEY}
      onComplete={onComplete}
      finishLabel={srOnboarding.dashboard.finishLabel}
    />
  );
}
