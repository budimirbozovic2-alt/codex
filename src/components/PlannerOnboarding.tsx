import { Target, Map as MapIcon, BarChart3, Flame, Calendar } from "lucide-react";
import OnboardingModal, { type OnboardingSlide } from "@/components/OnboardingModal";

export const PLANNER_ONBOARDING_KEY = "sr-planner-onboarding-seen";

const SLIDES: OnboardingSlide[] = [
  {
    icon: Target,
    iconColor: "bg-primary/15 text-primary",
    title: "Operativni plan",
    content: "Sistem generiše raspored na osnovu broja cjelina, težine predmeta i datuma ispita.",
    bullets: [
      "Teški predmeti dobijaju 1.5× više vremena",
      "Omjer učenje/ponavljanje se dinamički prilagođava",
      "Buffer % — sigurnosna zona za nepredviđene situacije",
    ],
  },
  {
    icon: MapIcon,
    iconColor: "bg-success/15 text-success",
    title: "Mapa puta",
    content: "Vizualni pregled napretka sa burn-up grafikonom i simulacijom završetka.",
    bullets: [
      "Burn-up grafikon — akumulirani napredak vs. cilj",
      "Tekstualna simulacija — kad ćeš završiti pri trenutnom tempu",
      "Dnevni i sedmični pregled obaveza",
    ],
  },
  {
    icon: Flame,
    iconColor: "bg-warning/15 text-warning",
    title: "Disciplina",
    content: "Praćenje dosljednosti i motivacije kroz streak sistem.",
    bullets: [
      "Rocket Streak — uzastopni dani sa ispunjenim ciljem",
      "14-dnevni grid — vizualni pregled aktivnosti",
      "Trend dosljednosti i prosjek po sedmici",
    ],
  },
  {
    icon: Calendar,
    iconColor: "bg-primary/15 text-primary",
    title: "Podešavanje planera",
    content: "Wizard za brzu konfiguraciju — datum ispita, dnevni sati i prioriteti.",
    bullets: [
      "Postavi datum ispita i dostupne sate dnevno",
      "Dodijeli težinu svakom predmetu",
      "Plan se automatski ažurira kad se promijene uslovi",
    ],
  },
];

export default function PlannerOnboarding({ onComplete }: { onComplete: () => void }) {
  return (
    <OnboardingModal
      slides={SLIDES}
      storageKey={PLANNER_ONBOARDING_KEY}
      onComplete={onComplete}
      finishLabel="Razumijem"
    />
  );
}
