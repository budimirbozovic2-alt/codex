import { Sparkles, LayoutDashboard, GraduationCap, RotateCcw, Map, Brain, BarChart3, Target, Rocket, Map as MapIcon, Flame, Calendar, TrendingUp, Activity, Gauge, ShieldAlert, Lightbulb } from "lucide-react";
import type { OnboardingSlide } from "@/components/OnboardingModal";

export const ONBOARDING_KEYS = {
  app: "sr-app-onboarding-seen",
  planner: "sr-planner-onboarding-seen",
  stats: "sr-stats-onboarding-seen",
  dashboard: "sr-dashboard-onboarding-seen",
} as const;

export type OnboardingPresetId = keyof typeof ONBOARDING_KEYS;

interface Preset {
  key: string;
  finish: string;
  slides: OnboardingSlide[];
}

const APP_SLIDES: OnboardingSlide[] = [
  {
    icon: Sparkles,
    iconColor: "bg-primary/15 text-primary",
    title: "Dobrodošli u CODEX",
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
      "Ctrl+K — brza pretraga kartica",
      "Backup podataka je dostupan u Podešavanja → Sistem (Export/Import)",
    ],
  },
];

const PLANNER_SLIDES: OnboardingSlide[] = [
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

const STATS_SLIDES: OnboardingSlide[] = [
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

const DASHBOARD_SLIDES: OnboardingSlide[] = [
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

export const ONBOARDING_PRESETS: Record<OnboardingPresetId, Preset> = {
  app:       { key: ONBOARDING_KEYS.app,       finish: "Počni koristiti", slides: APP_SLIDES },
  planner:   { key: ONBOARDING_KEYS.planner,   finish: "Razumijem",       slides: PLANNER_SLIDES },
  stats:     { key: ONBOARDING_KEYS.stats,     finish: "Razumijem",       slides: STATS_SLIDES },
  dashboard: { key: ONBOARDING_KEYS.dashboard, finish: "Razumijem",       slides: DASHBOARD_SLIDES },
};
