import { BookOpen, AlertTriangle, Brain, Lightbulb } from "lucide-react";
import OnboardingModal, { type OnboardingSlide } from "@/components/OnboardingModal";

export const METACOGNITIVE_ONBOARDING_KEY = "sr-metacognitive-onboarding-seen";

const SLIDES: OnboardingSlide[] = [
  {
    icon: BookOpen,
    iconColor: "bg-primary/15 text-primary",
    title: "Dnevnik refleksija",
    content: "Bilježi dnevne refleksije, postavljaj ciljeve i prati samoanalizu.",
    bullets: [
      "Svaki unos podržava oznake raspoloženja i kognitivnog stanja",
      "Nedeljni grafikon prati konzistentnost refleksija",
      "Postavi pitanja sebi: šta sam danas naučio? Šta me zbunjuje?",
    ],
  },
  {
    icon: AlertTriangle,
    iconColor: "bg-warning/15 text-warning",
    title: "Praćenje grešaka",
    content: "Sistematsko praćenje čestih grešaka sa statusima i rješenjima.",
    bullets: [
      "Statusi: aktivna, u obradi, riješena",
      "Dodaj mnemoničko rješenje za svaku grešku",
      "Sistem identifikuje obrasce iz grešaka",
    ],
  },
  {
    icon: Brain,
    iconColor: "bg-destructive/15 text-destructive",
    title: "Kognitivna dijagnostika",
    content: "Automatska analiza interferencija, slijepih tačaka i slabih kuka.",
    bullets: [
      "Interferencija — kartice koje se međusobno miješaju",
      "Slijepe tačke — oblasti koje izbjegavaš ili zanemaruješ",
      "Preporuke za mnemoničku obradu problematičnih kartica",
    ],
  },
  {
    icon: Lightbulb,
    iconColor: "bg-success/15 text-success",
    title: "Preporuke za poboljšanje",
    content: "Personalizovani savjeti bazirani na tvojim greškama i navikama.",
    bullets: [
      "Fokusirano ponavljanje problematičnih oblasti",
      "Prijedlozi za mnemoničke tehnike",
      "Praćenje napretka u rješavanju slabih tačaka",
    ],
  },
];

export default function MetacognitiveOnboarding({ onComplete }: { onComplete: () => void }) {
  return (
    <OnboardingModal
      slides={SLIDES}
      storageKey={METACOGNITIVE_ONBOARDING_KEY}
      onComplete={onComplete}
      finishLabel="Razumijem"
    />
  );
}
