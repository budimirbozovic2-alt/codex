import { Sparkles, BookOpen, Brain, Link2, CheckCircle2 } from "lucide-react";
import OnboardingModal, { type OnboardingSlide, hasSeenOnboarding as _hasSeenOnboarding } from "@/components/OnboardingModal";
import { srOnboarding } from "@/lib/i18n/sr-onboarding";

const ONBOARDING_KEY = "sr-learn-onboarding-seen";

export function hasSeenOnboarding(): boolean {
  return _hasSeenOnboarding(ONBOARDING_KEY);
}

interface Props {
  onComplete: () => void;
}

const ICONS = [Sparkles, BookOpen, Brain, Link2, CheckCircle2];
const ICON_COLORS = [
  "bg-primary/15 text-primary",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-destructive/15 text-destructive",
  "bg-primary/15 text-primary",
];
const LEVEL_MAP: Record<string, { level: string; levelColor: string }> = {
  "Lak": { level: "Lak", levelColor: "bg-success/15 text-success" },
  "Srednji": { level: "Srednji", levelColor: "bg-warning/15 text-warning" },
  "Teški": { level: "Teški", levelColor: "bg-destructive/15 text-destructive" },
};

const slides: OnboardingSlide[] = srOnboarding.learn.slides.map((slide, i) => ({
  icon: ICONS[i],
  iconColor: ICON_COLORS[i],
  title: slide.title,
  content: slide.content,
  bullets: [...slide.bullets],
  ...("level" in slide && slide.level ? LEVEL_MAP[slide.level] || {} : {}),
}));

export default function LearnOnboarding({ onComplete }: Props) {
  return (
    <OnboardingModal
      slides={slides}
      storageKey={ONBOARDING_KEY}
      onComplete={onComplete}
      finishLabel={srOnboarding.learn.finishLabel}
    />
  );
}
