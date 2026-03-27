


import { Sparkles, BookOpen, Brain, Link2, CheckCircle2 } from "lucide-react";
import OnboardingModal, { type OnboardingSlide, hasSeenOnboarding as _hasSeenOnboarding } from "@/components/OnboardingModal";
const ONBOARDING_KEY = "sr-learn-onboarding-seen";

export function hasSeenOnboarding(): boolean {
  return _hasSeenOnboarding(ONBOARDING_KEY);
}

interface Props {
  onComplete: () => void;
}

const slides: OnboardingSlide[] = [
  {
    icon: Sparkles,
    iconColor: "bg-primary/15 text-primary",
    title: "Tri režima učenja",
    content: "CODEX koristi progresivan sistem učenja — od pasivnog čitanja do aktivne produkcije znanja na glas.",
    bullets: [
      "Svaki režim odgovara drugom nivou spremnosti",
      "Počni od lakšeg i napreduj ka težem",
      "Fokus je na usmenoj reprodukciji, ne na pasivnom čitanju",
    ],
  },
  {
    icon: BookOpen,
    iconColor: "bg-success/15 text-success",
    title: "Slobodno učenje",
    level: "Lak",
    levelColor: "bg-success/15 text-success",
    content: "Upoznaj se sa materijalom bez pritiska.",
    bullets: [
      "Čitaj pitanja i odgovore svojim tempom",
      "Otvori i zatvori sekcije po volji",
      'Označi pitanje kao "Pročitano" kad završiš',
      "Idealno za prvi kontakt sa novim gradivom",
    ],
  },
  {
    icon: Brain,
    iconColor: "bg-warning/15 text-warning",
    title: "Aktivno prisjećanje",
    level: "Srednji",
    levelColor: "bg-warning/15 text-warning",
    content: "Pregledaj, a zatim reprodukuj iz sjećanja.",
    bullets: [
      "Faza 1: Pročitaj cijelo pitanje sa svim modulima",
      "Faza 2: Odgovori su skriveni — pokušaj ih ponoviti na glas",
      "Ocijeni svoje znanje od 1 do 4",
      "Samo ocjena 4 te pomjera na sljedeći modul",
      "Ocjena ispod 4 = ponovi taj modul odmah",
    ],
  },
  {
    icon: Link2,
    iconColor: "bg-destructive/15 text-destructive",
    title: "Metod lanca",
    level: "Teški",
    levelColor: "bg-destructive/15 text-destructive",
    content: "Snowball tehnika — gradi lanac savršenih ponavljanja.",
    bullets: [
      "Savladaj modul N ocjenom 4",
      "Zatim ponovi cijeli niz od modula 1 do N",
      "Ako bilo koji modul u lancu ocijeniiš ispod 4 → vraćaš se na modul 1",
      "Napredak je nemoguć bez savršenog lanca",
      "Dostupno samo za esejska pitanja sa 3+ modula",
    ],
  },
  {
    icon: CheckCircle2,
    iconColor: "bg-primary/15 text-primary",
    title: "Spreman si!",
    content: "Tvoj napredak se automatski čuva. Ako izađeš usred učenja, nastavićeš tamo gdje si stao.",
    bullets: [
      "Ocjene se upisuju u FSRS sistem i utiču na buduća ponavljanja",
      "Savladana pitanja se označavaju zelenom bojom",
      "Preporučujemo: Slobodno → Aktivno → Lanac",
    ],
  },
];

export default function LearnOnboarding({ onComplete }: Props) {
  return (
    <OnboardingModal
      slides={slides}
      storageKey={ONBOARDING_KEY}
      onComplete={onComplete}
      finishLabel="Počni učenje"
    />
  );
}
