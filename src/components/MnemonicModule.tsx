import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MnemonicCard, loadMnemonicCards, saveMnemonicCards,
  addMnemonicTestEntry, getMnemonicStats,
} from "@/lib/mnemonic-storage";
import { CheckCircle2 } from "lucide-react";
import { default as ArrowLeft } from "lucide-react/dist/esm/icons/arrow-left";
import { default as ArrowRight } from "lucide-react/dist/esm/icons/arrow-right";
import { default as Brain } from "lucide-react/dist/esm/icons/brain";
import { default as Wrench } from "lucide-react/dist/esm/icons/wrench";
import { default as FlaskConical } from "lucide-react/dist/esm/icons/flask-conical";
import { default as Sparkles } from "lucide-react/dist/esm/icons/sparkles";
import { default as Hash } from "lucide-react/dist/esm/icons/hash";
import { default as HelpCircle } from "lucide-react/dist/esm/icons/help-circle";
import { default as Film } from "lucide-react/dist/esm/icons/film";
import { default as Type } from "lucide-react/dist/esm/icons/type";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import MnemonicWorkshop from "./MnemonicWorkshop";
import MnemonicTest from "./MnemonicTest";
import MajorSystemSettings from "./MajorSystemSettings";

interface Props {
  onBack: () => void;
}

const MNEMONIC_KEY = ["mnemonicCards"] as const;
const MNEMO_ONBOARDING_KEY = "sr-mnemo-onboarding-seen";

const MNEMO_SLIDES = [
  {
    icon: Brain,
    iconColor: "bg-primary/15 text-primary",
    title: "Dobrodošli u Memorizaciju",
    content: 'Izolovani sistem za kreiranje i testiranje mentalnih kuka. Označi kartice tagom \u201eMemorizacija\u201c (ikona mozga) u bazi podataka da ih dodaš ovdje.',
  },
  {
    icon: Film,
    iconColor: "bg-primary/15 text-primary",
    title: "Mentalni video",
    content: "Opiši živopisnu vizuelnu scenu koju povezuješ sa gradivom. Što dramatičnija i bizarnija slika, to bolje pamćenje. Koristi boje, pokrete i emocije.",
  },
  {
    icon: Type,
    iconColor: "bg-warning/15 text-warning",
    title: "Akronim",
    content: "Za nabrajanja, sistem automatski detektuje stavke i sugeriše prva slova. Smisli riječ ili frazu od tih slova za brzo prisjećanje.",
  },
  {
    icon: Hash,
    iconColor: "bg-accent-foreground/15 text-accent-foreground",
    title: "Major sistem",
    content: 'Brojevi u tekstu se automatski pretvaraju u riječi pomoću fonetskog koda (0=OSA, 1=DUH...). Konfiguriši tablice u sekciji \u201eMentalne tablice\u201c.',
  },
  {
    icon: FlaskConical,
    iconColor: "bg-success/15 text-success",
    title: "Testiranje",
    content: "Sistem prikazuje pitanje, a ti imaš 3 sekunde da prizoveš mentalnu sliku. Vidiš samo svoj okidač, ne originalni tekst. Prati uspješnost kroz statistiku.",
  },
];

function MnemoOnboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const slide = MNEMO_SLIDES[step];
  const Icon = slide.icon;

  const finish = () => {
    localStorage.setItem(MNEMO_ONBOARDING_KEY, "true");
    onComplete();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={finish}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="bg-background border rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="p-6 space-y-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${slide.iconColor}`}>
            <Icon className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-serif">{slide.title}</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{slide.content}</p>
          <div className="flex items-center justify-center gap-1.5 pt-2">
            {MNEMO_SLIDES.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === step ? "bg-primary" : "bg-secondary"}`} />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between p-4 border-t">
          {step > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep(s => s - 1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Nazad
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={finish}>Preskoči</Button>
          )}
          {step < MNEMO_SLIDES.length - 1 ? (
            <Button size="sm" onClick={() => setStep(s => s + 1)}>
              Dalje <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={finish}>
              Počni <CheckCircle2 className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function MnemonicModule({ onBack }: Props) {
  const qc = useQueryClient();
  const { data: cards = [] } = useQuery({
    queryKey: MNEMONIC_KEY,
    queryFn: loadMnemonicCards,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const [subView, setSubView] = useState<"menu" | "workshop" | "test" | "major">("menu");
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem(MNEMO_ONBOARDING_KEY) !== "true"
  );

  const setCards = useCallback((updater: (prev: MnemonicCard[]) => MnemonicCard[]) => {
    qc.setQueryData<MnemonicCard[]>(MNEMONIC_KEY, (old) => {
      const next = updater(old || []);
      saveMnemonicCards(next);
      return next;
    });
  }, [qc]);

  const updateCard = useCallback((id: string, updates: Partial<MnemonicCard>) => {
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, [setCards]);

  const deleteCard = useCallback((id: string) => {
    setCards(prev => prev.filter(c => c.id !== id));
  }, [setCards]);

  const recordResult = useCallback((cardId: string, success: boolean) => {
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      return {
        ...c,
        testCount: c.testCount + 1,
        successCount: c.successCount + (success ? 1 : 0),
        failCount: c.failCount + (success ? 0 : 1),
        lastTested: Date.now(),
      };
    }));
    addMnemonicTestEntry({ timestamp: Date.now(), cardId, success });
  }, [setCards]);

  const stats = useMemo(() => getMnemonicStats(cards), [cards]);

  if (subView === "workshop") {
    return <MnemonicWorkshop cards={cards} onUpdateCard={updateCard} onDeleteCard={deleteCard} onBack={() => setSubView("menu")} />;
  }

  if (subView === "test") {
    return <MnemonicTest cards={cards} onRecordResult={recordResult} onBack={() => setSubView("menu")} />;
  }

  if (subView === "major") {
    return <MajorSystemSettings onBack={() => setSubView("menu")} />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <AnimatePresence>
        {showOnboarding && <MnemoOnboarding onComplete={() => setShowOnboarding(false)} />}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
            <ArrowLeft className="h-4 w-4" /> Nazad
          </button>
          <h2 className="text-4xl font-serif flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" /> Memorizacija
          </h2>
          <p className="text-muted-foreground mt-2">Izolovani sistem za kreiranje i testiranje mentalnih kuka.</p>
        </div>
        <button
          onClick={() => setShowOnboarding(true)}
          className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title="Vodič kroz memorizaciju"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl bg-card border p-4">
          <p className="text-2xl font-serif">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Ukupno</p>
        </div>
        <div className="rounded-xl bg-card border p-4">
          <Sparkles className="h-4 w-4 text-muted-foreground mb-1" />
          <p className="text-2xl font-serif">{stats.newCount}</p>
          <p className="text-xs text-muted-foreground">Nove</p>
        </div>
        <div className="rounded-xl bg-card border p-4">
          <Wrench className="h-4 w-4 text-warning mb-1" />
          <p className="text-2xl font-serif">{stats.workshopCount}</p>
          <p className="text-xs text-muted-foreground">U radionici</p>
        </div>
        <div className="rounded-xl bg-card border p-4">
          <CheckCircle2 className="h-4 w-4 text-success mb-1" />
          <p className="text-2xl font-serif">{stats.readyCount}</p>
          <p className="text-xs text-muted-foreground">Spremne</p>
        </div>
      </div>

      {stats.avgSuccess > 0 && (
        <div className="rounded-xl bg-card border p-4 flex items-center gap-3">
          <FlaskConical className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium">Prosječna uspješnost testiranja</p>
            <p className={`text-2xl font-serif ${stats.avgSuccess >= 70 ? "text-success" : stats.avgSuccess >= 40 ? "text-warning" : "text-destructive"}`}>
              {stats.avgSuccess}%
            </p>
          </div>
        </div>
      )}

      {/* Menu options */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setSubView("workshop")}
          className="rounded-xl border bg-card p-6 text-left hover:border-primary/40 transition-colors space-y-3"
        >
          <Wrench className="h-8 w-8 text-warning" />
          <h3 className="text-lg font-serif">Radionica mentalnih kuka</h3>
          <p className="text-sm text-muted-foreground">Kreiraj mentalne videe i akronime za kartice.</p>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setSubView("test")}
          className="rounded-xl border bg-card p-6 text-left hover:border-primary/40 transition-colors space-y-3"
        >
          <FlaskConical className="h-8 w-8 text-primary" />
          <h3 className="text-lg font-serif">Testiranje mentalnih kuka</h3>
          <p className="text-sm text-muted-foreground">Testiraj koliko dobro pamtiš uz pomoć mentalnih slika.</p>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setSubView("major")}
          className="rounded-xl border bg-card p-6 text-left hover:border-primary/40 transition-colors space-y-3"
        >
          <Hash className="h-8 w-8 text-accent-foreground" />
          <h3 className="text-lg font-serif">Mentalne tablice</h3>
          <p className="text-sm text-muted-foreground">Prilagodi Major sistem termine za brojeve 0–100.</p>
        </motion.button>
      </div>

      {cards.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
          <Brain className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Još nema kartica za memorizaciju.</p>
          <p className="text-xs mt-1">Označi kartice tagom <strong>"Memorizacija"</strong> (ikona mozga) u listi kartica.</p>
        </div>
      )}
    </div>
  );
}
