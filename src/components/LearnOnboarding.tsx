import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, CheckCircle2 } from "lucide-react";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import { default as Brain } from "lucide-react/dist/esm/icons/brain";
import { default as ArrowRight } from "lucide-react/dist/esm/icons/arrow-right";
import { default as ArrowLeft } from "lucide-react/dist/esm/icons/arrow-left";
import { default as X } from "lucide-react/dist/esm/icons/x";
import { default as Sparkles } from "lucide-react/dist/esm/icons/sparkles";
import { Button } from "@/components/ui/button";

const ONBOARDING_KEY = "sr-learn-onboarding-seen";

export function hasSeenOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

function markOnboardingSeen() {
  localStorage.setItem(ONBOARDING_KEY, "true");
}

interface Props {
  onComplete: () => void;
}

const slides = [
  {
    icon: Sparkles,
    iconColor: "bg-primary/15 text-primary",
    title: "Tri režima učenja",
    subtitle: "Memoria koristi progresivan sistem učenja — od pasivnog čitanja do aktivne produkcije znanja na glas.",
    bullets: [
      "Svaki režim odgovara drugom nivou spremnosti",
      "Počni od lakšeg i napreduj ka težem",
      "Fokus je na usmenoj reprodukciji, ne na pasivnom čitanju",
    ],
  },
  {
    icon: BookOpen,
    iconColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    level: "Lak",
    levelColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    title: "Slobodno učenje",
    subtitle: "Upoznaj se sa materijalom bez pritiska.",
    bullets: [
      "Čitaj pitanja i odgovore svojim tempom",
      "Otvori i zatvori sekcije po volji",
      'Označi pitanje kao "Pročitano" kad završiš',
      "Idealno za prvi kontakt sa novim gradivom",
    ],
  },
  {
    icon: Brain,
    iconColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    level: "Srednji",
    levelColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    title: "Aktivno prisjećanje",
    subtitle: "Pregledaj, a zatim reprodukuj iz sjećanja.",
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
    level: "Teški",
    levelColor: "bg-destructive/15 text-destructive",
    title: "Metod lanca",
    subtitle: "Snowball tehnika — gradi lanac savršenih ponavljanja.",
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
    subtitle: "Tvoj napredak se automatski čuva. Ako izađeš usred učenja, nastavićeš tamo gdje si stao.",
    bullets: [
      "Ocjene se upisuju u FSRS sistem i utiču na buduća ponavljanja",
      "Savladana pitanja se označavaju zelenom bojom",
      "Preporučujemo: Slobodno → Aktivno → Lanac",
    ],
  },
];

export default function LearnOnboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const slide = slides[step];
  const Icon = slide.icon;
  const isLast = step === slides.length - 1;

  const handleComplete = () => {
    markOnboardingSeen();
    onComplete();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-lg rounded-2xl border bg-card shadow-xl overflow-hidden"
      >
        {/* Skip button */}
        <button
          onClick={handleComplete}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors z-10"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pt-6">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-6 bg-primary" : i < step ? "w-1.5 bg-primary/40" : "w-1.5 bg-secondary"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="p-8 pt-6"
          >
            <div className="flex flex-col items-center text-center mb-6">
              <div className={`p-4 rounded-2xl mb-4 ${slide.iconColor}`}>
                <Icon className="h-8 w-8" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xl font-serif font-semibold">{slide.title}</h3>
                {"level" in slide && slide.level && (
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${slide.levelColor}`}>
                    {slide.level}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground max-w-sm">{slide.subtitle}</p>
            </div>

            <ul className="space-y-2.5 mb-8">
              {slide.bullets.map((bullet, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-start gap-3 text-sm"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <span className="text-muted-foreground">{bullet}</span>
                </motion.li>
              ))}
            </ul>

            {/* Navigation */}
            <div className="flex items-center gap-3">
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Nazad
                </Button>
              )}
              {isLast ? (
                <Button onClick={handleComplete} className="flex-1">
                  Počni učenje <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={() => setStep((s) => s + 1)} className="flex-1">
                  Dalje <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
