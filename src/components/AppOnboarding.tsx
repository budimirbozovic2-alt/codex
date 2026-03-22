import { default as Sparkles } from "lucide-react/dist/esm/icons/sparkles";
import { default as LayoutDashboard } from "lucide-react/dist/esm/icons/layout-dashboard";
import { default as GraduationCap } from "lucide-react/dist/esm/icons/graduation-cap";
import { default as RotateCcw } from "lucide-react/dist/esm/icons/rotate-ccw";
import { default as Map } from "lucide-react/dist/esm/icons/map";
import { default as Brain } from "lucide-react/dist/esm/icons/brain";
import { default as BarChart3 } from "lucide-react/dist/esm/icons/bar-chart-3";
import { default as Target } from "lucide-react/dist/esm/icons/target";
import { default as Rocket } from "lucide-react/dist/esm/icons/rocket";
import OnboardingModal, { type OnboardingSlide } from "@/components/OnboardingModal";

export const APP_ONBOARDING_KEY = "sr-app-onboarding-seen";

const APP_SLIDES: OnboardingSlide[] = [
  {
    icon: Sparkles,
    iconColor: "bg-primary/15 text-primary",
    title: "Dobrodošli u Memoria-u",
    content: "Inteligentni sistem za učenje koji se prilagođava tvom napretku. Evo kratkog pregleda ključnih funkcija.",
    bullets: [
      "Sve kartice se automatski raspoređuju po FSRS algoritmu",
      "Sistem prati stabilnost, težinu i greške za svaku cjelinu",
      "Tvoj cilj: savladaj gradivo kroz aktivno prisjećanje",
    ],
  },
  {
    icon: LayoutDashboard,
    iconColor: "bg-primary/15 text-primary",
    title: "Kontrolna tabla",
    content: "Centralni pregled napretka sa dnevnim ciljem, streikom i preporukama.",
    bullets: [
      "Progres ispita, dnevni cilj i streak na jednom mjestu",
      "Idealni fokus — optimalan omjer novog i ponavljanog",
      "Statusne ikone upozoravaju na rizike i propuste",
    ],
  },
  {
    icon: GraduationCap,
    iconColor: "bg-success/15 text-success",
    title: "Učenje",
    content: "Tri progresivna režima za savladavanje novog gradiva.",
    bullets: [
      "Slobodno učenje — čitaj bez pritiska",
      "Aktivno prisjećanje — reprodukuj iz sjećanja",
      "Metod lanca — gradi savršen niz ponavljanja",
    ],
  },
  {
    icon: RotateCcw,
    iconColor: "bg-warning/15 text-warning",
    title: "Konsolidacija",
    content: "Ponavljaj kartice koje su spremne za utvrđivanje.",
    bullets: [
      "Fokusirano — svježe i pogrešne kartice",
      "Kritični pregled — optimalni momenat za ponavljanje",
      "Najteža pitanja — tvrdokorno gradivo zahtijeva posebnu pažnju",
    ],
  },
  {
    icon: Map,
    iconColor: "bg-accent-foreground/15 text-accent-foreground",
    title: "Mapa znanja",
    content: "Vizuelni pregled savladanosti po kategorijama, podkategorijama i glavama.",
    bullets: [
      "Navigator — organizuj kartice po glavama drag-and-drop-om",
      "Auditor — heatmapa savladanosti sa detaljnim statistikama",
      "Mentalni kostur — strukturiraj gradivo za bolje razumijevanje",
    ],
  },
  {
    icon: Brain,
    iconColor: "bg-primary/15 text-primary",
    title: "Memorizacija",
    content: "Mnemotehničke alate za teško pamtive informacije.",
    bullets: [
      "Mentalni video — vizuelizuj gradivo kroz žive scene",
      "Akronimi — napravi kratice od nabrajanja",
      "Major sistem — pretvori brojeve u riječi fonetskim kodom",
    ],
  },
  {
    icon: BarChart3,
    iconColor: "bg-success/15 text-success",
    title: "Statistika i analitika",
    content: "Detaljni uvid u tvoj napredak i kognitivne obrasce.",
    bullets: [
      "Krivulja zaboravljanja i predikcija retencije",
      "Kalibracija — koliko su tvoje ocjene precizne",
      "Efikasnost i latencija po sesijama",
    ],
  },
  {
    icon: Target,
    iconColor: "bg-destructive/15 text-destructive",
    title: "Strateški planer i dnevnik",
    content: "Postavi ciljeve, prati disciplinu i reflektuj o svom učenju.",
    bullets: [
      "Definiši predmete, ciljeve i rokove",
      "Prati dnevnu disciplinu i kognitivni dug",
      "Dnevnik za metakognitivnu refleksiju",
    ],
  },
  {
    icon: Rocket,
    iconColor: "bg-primary/15 text-primary",
    title: "Spreman si!",
    content: "Svaka sekcija ima svoje dugme za pomoć (?) sa detaljnijim uputstvima. Počni kreiranjem prve kartice ili uvozom iz dokumenta.",
    bullets: [
      "Klikom na ? u bilo kojoj sekciji dobijaš detaljni vodič",
      "Ctrl+K — brza globalna pretraga",
      "Backup podataka je dostupan u podešavanjima",
    ],
  },
];

export default function AppOnboarding({ onComplete }: { onComplete: () => void }) {
  return (
    <OnboardingModal
      slides={APP_SLIDES}
      storageKey={APP_ONBOARDING_KEY}
      onComplete={onComplete}
      finishLabel="Počni koristiti"
    />
  );
}
