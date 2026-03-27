


import { LayoutDashboard, Target, Gauge, ShieldAlert, TrendingUp, Lightbulb } from "lucide-react";
import OnboardingModal, { type OnboardingSlide } from "@/components/OnboardingModal";
export const DASHBOARD_ONBOARDING_KEY = "sr-dashboard-onboarding-seen";

const SLIDES: OnboardingSlide[] = [
  {
    icon: LayoutDashboard,
    iconColor: "bg-primary/15 text-primary",
    title: "Kontrolna tabla",
    content: "Centralni pregled tvog napretka, ciljeva i preporuka — sve na jednom mjestu.",
    bullets: [
      "Dnevni cilj i streak prate tvoju disciplinu",
      "Progres ispita pokazuje koliko si daleko od cilja",
      "Widgeti se mogu uključiti/isključiti u podešavanjima",
    ],
  },
  {
    icon: Target,
    iconColor: "bg-success/15 text-success",
    title: "Dnevni cilj i streak",
    content: "Prati koliko sekcija si danas obradio u odnosu na postavljeni cilj.",
    bullets: [
      "Progress bar pokazuje procenat ispunjenja dnevnog cilja",
      "Streak broji uzastopne dane sa barem jednom sesijom",
      "Kartice za prvo ponavljanje ukazuju na nepregledan materijal",
    ],
  },
  {
    icon: Gauge,
    iconColor: "bg-warning/15 text-warning",
    title: "Idealni fokus",
    content: "Sistem automatski računa optimalan odnos novog i ponavljanog gradiva.",
    bullets: [
      "Što više naučiš, više vremena treba za ponavljanje",
      "Preporučeni omjer se prilagođava tvom napretku",
      "Stvarni omjer danas se prikazuje pored preporučenog",
    ],
  },
  {
    icon: ShieldAlert,
    iconColor: "bg-destructive/15 text-destructive",
    title: "Statusne ikone i upozorenja",
    content: "Crvene i žute ikone signaliziraju potencijalne probleme.",
    bullets: [
      "Rizik od zagušenja memorije — previše novog, premalo ponavljanja",
      "Kognitivni dug — propušteni dani se akumuliraju",
      "Upozorenja za backup i storage prostor",
    ],
  },
  {
    icon: TrendingUp,
    iconColor: "bg-primary/15 text-primary",
    title: "Velocitet i najslabije kategorije",
    content: "Prati brzinu učenja i identificiraj oblasti koje zahtijevaju pažnju.",
    bullets: [
      "Velocitet (sekcija/dan) pokazuje prosječnu brzinu za 7 dana",
      "Trend strelica indicira da li ubrzavaš ili usporavaš",
      "Top 3 najslabije kategorije — fokusiraj se na njih",
    ],
  },
  {
    icon: Lightbulb,
    iconColor: "bg-accent-foreground/15 text-accent-foreground",
    title: "Briefing i energetska preporuka",
    content: "Personalizovani savjeti bazirani na tvom rasporedu i napretku.",
    bullets: [
      "Dnevni briefing predlaže konkretne akcije za danas",
      "Energetski nivo se računa prema dobu dana",
      "Preporuka za vrstu aktivnosti (učenje, ponavljanje, dril)",
    ],
  },
];

export default function DashboardOnboarding({ onComplete }: { onComplete: () => void }) {
  return (
    <OnboardingModal
      slides={SLIDES}
      storageKey={DASHBOARD_ONBOARDING_KEY}
      onComplete={onComplete}
      finishLabel="Razumijem"
    />
  );
}
