import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MnemonicCard, loadMnemonicCards, saveMnemonicCards,
  addMnemonicTestEntry, getMnemonicStats,
} from "@/lib/mnemonic-storage";
import { ArrowLeft, Brain, Wrench, FlaskConical, Sparkles, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import InfoPanel from "@/components/InfoPanel";
import MnemonicWorkshop from "./MnemonicWorkshop";
import MnemonicTest from "./MnemonicTest";

interface Props {
  onBack: () => void;
}

const MNEMONIC_KEY = ["mnemonicCards"] as const;

export default function MnemonicModule({ onBack }: Props) {
  const qc = useQueryClient();
  const { data: cards = [] } = useQuery({
    queryKey: MNEMONIC_KEY,
    queryFn: loadMnemonicCards,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const [subView, setSubView] = useState<"menu" | "workshop" | "test">("menu");

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
    return <MnemonicWorkshop cards={cards} onUpdateCard={updateCard} onBack={() => setSubView("menu")} />;
  }

  if (subView === "test") {
    return <MnemonicTest cards={cards} onRecordResult={recordResult} onBack={() => setSubView("menu")} />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
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
        <InfoPanel title="Kako radi Memorizacija?">
          <p><strong className="text-foreground">Mentalne kuke</strong> — za svaku karticu kreiraš vizuelnu asocijaciju (mentalni video) ili akronim koji pomaže pamćenju ključnih podataka.</p>
          <p><strong className="text-foreground">Radionica</strong> — otvori karticu, napiši mentalni video ili akronim, i promijeni status u „Spremna" kad završiš.</p>
          <p><strong className="text-foreground">Testiranje</strong> — sistem prikazuje pitanje, a ti imaš 3 sekunde da prizoveš mentalnu sliku. Vidiš samo svoj „okidač\", ne originalni tekst.</p>
          <p><strong className="text-foreground">Kako dodati kartice?</strong> U Bazi podataka označi karticu tagom <strong>„Memorizacija"</strong> (ikona 🧠) — automatski se klonira ovdje.</p>
          <p><strong className="text-foreground">Major sistem</strong> — brojevi u tekstu se automatski pretvaraju u riječi (0=OSA, 1=DUH...) za lakše vizuelno pamćenje.</p>
        </InfoPanel>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
