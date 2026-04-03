import { Sparkles, LayoutDashboard, GraduationCap, RotateCcw, Map, Brain, BarChart3, Target, Rocket } from "lucide-react";
import OnboardingModal, { type OnboardingSlide } from "@/components/OnboardingModal";
import { srOnboarding } from "@/lib/i18n/sr-onboarding";

export const APP_ONBOARDING_KEY = "sr-app-onboarding-seen";

const ICONS = [Sparkles, LayoutDashboard, GraduationCap, RotateCcw, Map, Brain, BarChart3, Target, Rocket];
const ICON_COLORS = [
  "bg-primary/15 text-primary",
  "bg-primary/15 text-primary",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-accent-foreground/15 text-accent-foreground",
  "bg-primary/15 text-primary",
  "bg-success/15 text-success",
  "bg-destructive/15 text-destructive",
  "bg-primary/15 text-primary",
];

const APP_SLIDES: OnboardingSlide[] = srOnboarding.app.slides.map((slide, i) => ({
  icon: ICONS[i],
  iconColor: ICON_COLORS[i],
  title: slide.title,
  content: slide.content,
  bullets: [...slide.bullets],
}));

export default function AppOnboarding({ onComplete }: { onComplete: () => void }) {
  return (
    <OnboardingModal
      slides={APP_SLIDES}
      storageKey={APP_ONBOARDING_KEY}
      onComplete={onComplete}
      finishLabel={srOnboarding.app.finishLabel}
    />
  );
}
