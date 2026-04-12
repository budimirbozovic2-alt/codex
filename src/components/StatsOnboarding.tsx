import { TrendingUp, Activity, Target, Gauge, BarChart3, ShieldAlert } from "lucide-react";
import OnboardingModal, { type OnboardingSlide } from "@/components/OnboardingModal";

export const STATS_ONBOARDING_KEY = "sr-stats-onboarding-seen";

const SLIDES: OnboardingSlide[] = [
  {
    icon: TrendingUp,
    iconColor: "bg-primary/15 text-primary",
    title: "Statistika",
    content: "Detaljna analitika tvog učenja — od dnevne aktivnosti do dugoročnih trendova.",
    bullets: [
      "Heatmapa aktivnosti za vizualni pregled navika",
      "Distribucija znanja po nivoima (novi, učenje, pregled, savladano)",
      "Kriva zaboravljanja i omjer ponavljanja",
    ],
  },
  {
    icon: Target,
    iconColor: "bg-success/15 text-success",
    title: "Kalibracija",
    content: "Mjeri koliko dobro procjenjuješ vlastito znanje.",
    bullets: [
      "Uporedi samoprocjenu (1-4) sa stvarnom ocjenom",
      "Detektuj iluziju znanja — kad misliš da znaš, a ne znaš",
      "Kalibracioni grafikon pokazuje tačnost po nivou sigurnosti",
    ],
  },
  {
    icon: Activity,
    iconColor: "bg-warning/15 text-warning",
    title: "Latencija i otpor",
    content: "Analiza brzine odgovaranja i otpornosti znanja na zaboravljanje.",
    bullets: [
      "Latencija — prosječno vrijeme do otkrivanja odgovora",
      "Otpor — kombinovani skor lapsusa, latencije i zaboravljanja",
      "Prag automatizacije: <3 sekunde za čvrsto znanje",
    ],
  },
  {
    icon: BarChart3,
    iconColor: "bg-primary/15 text-primary",
    title: "Predikcija i efikasnost",
    content: "Predviđanje budućeg opterećenja i analiza produktivnosti.",
    bullets: [
      "Predikcija — projekcija ponavljanja po predmetima za naredne dane",
      "Efikasnost — odnos uloženog vremena i postignutog napretka",
      "Preporuke za optimizaciju učenja",
    ],
  },
];

export default function StatsOnboarding({ onComplete }: { onComplete: () => void }) {
  return (
    <OnboardingModal
      slides={SLIDES}
      storageKey={STATS_ONBOARDING_KEY}
      onComplete={onComplete}
      finishLabel="Razumijem"
    />
  );
}
