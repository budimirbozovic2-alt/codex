/* eslint-disable react-refresh/only-export-components --
 * Co-exports `hasSeenOnboarding()` helper (1 line) tightly coupled to this
 * onboarding's storage key. Splitting adds a file for no functional benefit.
 */
import { GitBranch, Workflow, MousePointerClick, CheckCircle2 } from "lucide-react";
import OnboardingModal, { type OnboardingSlide, hasSeenOnboarding as _hasSeenOnboarding } from "@/components/OnboardingModal";

const ONBOARDING_KEY = "sr-mindmap-onboarding-seen";

export function hasSeenOnboarding(): boolean {
  return _hasSeenOnboarding(ONBOARDING_KEY);
}

interface Props {
  onComplete: () => void;
}

const slides: OnboardingSlide[] = [
  {
    icon: GitBranch,
    iconColor: "bg-primary/15 text-primary",
    title: "Hijerarhija",
    content: "Vizuelni prikaz organizacionih struktura sa grananjem od vrha ka dnu.",
    bullets: [
      "Idealno za sudske sisteme, organe vlasti, klasifikacije",
      "Čvorovi se povezuju linijama roditelj → dijete",
      "Dodaj opis svakom čvoru za detalje",
    ],
  },
  {
    icon: Workflow,
    iconColor: "bg-warning/15 text-warning",
    title: "Procedura",
    content: "Tok postupka sa fazama, rokovima i pravnim lijekovima.",
    bullets: [
      "Koristi dijamantske čvorove za odluke (Da/Ne)",
      "Pravougaonici za korake, zaobljeni za početak/kraj",
      "Poveži čvorove strelicama sa labelama",
    ],
  },
  {
    icon: MousePointerClick,
    iconColor: "bg-success/15 text-success",
    title: "Interakcija",
    content: "Kako koristiti canvas za kreiranje i uređivanje mapa.",
    bullets: [
      "Dvoklik na prazno polje → novi čvor",
      "Povuci iz handle-a čvora → nova veza",
      "Klikni na čvor/vezu za uređivanje",
      "Toolbar nudi dodavanje, brisanje i eksport",
    ],
  },
  {
    icon: CheckCircle2,
    iconColor: "bg-primary/15 text-primary",
    title: "Spreman si!",
    content: "Sve promjene se automatski čuvaju. Mape možeš eksportovati u kategorije.",
    bullets: [
      "Koristi zoom i pan za navigaciju velikih mapa",
      "Svaki čvor ima naslov i opcioni opis",
      "Eksportuj gotovu mapu kao kartice u bazu",
    ],
  },
];

export default function MindMapOnboarding({ onComplete }: Props) {
  return (
    <OnboardingModal
      slides={slides}
      storageKey={ONBOARDING_KEY}
      onComplete={onComplete}
      finishLabel="Počni"
    />
  );
}
