import { Zap, BookOpen, Settings2, Eye } from "lucide-react";
import OnboardingModal, { type OnboardingSlide } from "@/components/OnboardingModal";

export const SPEED_READER_ONBOARDING_KEY = "sr-speed-reader-onboarding-seen";

const SLIDES: OnboardingSlide[] = [
  {
    icon: Zap,
    iconColor: "bg-primary/15 text-primary",
    title: "Brzo čitanje",
    content: "Čitaj kartice, izvore ili cjeline ubrzanim prikazom riječ-po-riječ.",
    bullets: [
      "RSVP metoda — jedna riječ u centru pažnje",
      "Podesi brzinu (WPM) prema svom nivou",
      "Pauziraj i nastavi u bilo kom trenutku",
    ],
  },
  {
    icon: BookOpen,
    iconColor: "bg-success/15 text-success",
    title: "Izbor sadržaja",
    content: "Čitaj kartice po cjelinama, pojedinačne kartice ili cijele izvore.",
    bullets: [
      "Filtriraj po predmetu i cjelini",
      "Izaberi kartice ili izvore kao materijal",
      "Segmenti se prikazuju u navigacionoj traci",
    ],
  },
  {
    icon: Eye,
    iconColor: "bg-warning/15 text-warning",
    title: "Fokusni prikaz",
    content: "Centrirana riječ sa minimalnim distrakcijama za maksimalnu koncentraciju.",
    bullets: [
      "Minimalistički ekran za duboki fokus",
      "Progress bar pokazuje poziciju u tekstu",
      "Navigacija između segmenata jednim klikom",
    ],
  },
  {
    icon: Settings2,
    iconColor: "bg-primary/15 text-primary",
    title: "Podešavanja",
    content: "Prilagodi iskustvo čitanja prema svojim potrebama.",
    bullets: [
      "WPM slider — od sporog do ultra-brzog",
      "Tastaturne prečice za kontrolu bez miša",
      "Automatski prelazak na sljedeći segment",
    ],
  },
];

export default function SpeedReaderOnboarding({ onComplete }: { onComplete: () => void }) {
  return (
    <OnboardingModal
      slides={SLIDES}
      storageKey={SPEED_READER_ONBOARDING_KEY}
      onComplete={onComplete}
      finishLabel="Razumijem"
    />
  );
}
