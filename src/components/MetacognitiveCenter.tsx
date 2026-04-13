import { BookOpen, Brain, AlertTriangle, HelpCircle } from "lucide-react";
import { useMemo, lazy, Suspense } from "react";
import { motion } from "framer-motion";

import InfoPanel from "@/components/InfoPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReviewLogEntry } from "@/lib/storage";
import { Card, SRSettings } from "@/lib/spaced-repetition";
import { type CategoryRecord } from "@/lib/db";
import { Skeleton } from "@/components/ui/skeleton";

const DiarySection = lazy(() => import("./metacognitive/DiarySection"));
const FrequentErrors = lazy(() => import("@/pages/FrequentErrors"));
const CognitiveAnalytics = lazy(() => import("./CognitiveAnalytics"));

interface Props {
  cards: Card[];
  categories: string[];
  categoryRecords: CategoryRecord[];
  reviewLog: ReviewLogEntry[];
  settings?: SRSettings;
  embedded?: boolean;
  onClearErrorLog?: (cardId: string) => void;
  onShowOnboarding?: () => void;
}

export default function MetacognitiveCenter({ cards, categories, categoryRecords, reviewLog, settings, embedded, onClearErrorLog, onShowOnboarding }: Props) {
  const catNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of categoryRecords) map[r.id] = r.name;
    return map;
  }, [categoryRecords]);

  const fallback = (
    <div className="space-y-4 mt-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-[240px] w-full rounded-xl" />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-6">
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><BookOpen className="h-6 w-6 text-primary" /> Dnevnik</h2>
            <p className="text-muted-foreground mt-1">Refleksije, greške i kognitivna dijagnostika</p>
          </div>
          <div className="flex items-center gap-1">
            <InfoPanel title="Kako radi Dnevnik?">
              <p><strong className="text-foreground">Dnevnik</strong> — bilježi dnevne refleksije, postavlja ciljeve i prati samoanalizu. Svaki unos podržava oznake raspoloženja i kognitivnog stanja.</p>
              <p><strong className="text-foreground">Greške & Dijagnostika</strong> — praćenje čestih grešaka sa statusima (aktivna, riješena, u obradi) i mnemonička rješenja za svaku grešku.</p>
              <p><strong className="text-foreground">Analiza slabih tačaka</strong> — sistem identifikuje obrasce iz grešaka i predlaže fokusirano ponavljanje problematičnih oblasti.</p>
              <div className="pt-1 border-t border-border mt-1">
                <p className="font-medium text-foreground mb-1">Prečice</p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between"><span>Globalna pretraga</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">Ctrl+K</kbd></div>
                  <div className="flex items-center justify-between"><span>Workflow sidebar</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">M</kbd></div>
                  <div className="flex items-center justify-between"><span>Zatvori modal</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">ESC</kbd></div>
                </div>
              </div>
            </InfoPanel>
            {onShowOnboarding && (
              <button
                onClick={onShowOnboarding}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary"
                title="Vodič za dnevnik"
                aria-label="Vodič za dnevnik"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Onboarding</span>
              </button>
            )}
          </div>
        </div>
      )}

      <Tabs defaultValue="diary" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="diary" className="gap-1.5 text-xs sm:text-sm"><BookOpen className="h-3.5 w-3.5" /> Dnevnik</TabsTrigger>
          <TabsTrigger value="errors" className="gap-1.5 text-xs sm:text-sm"><AlertTriangle className="h-3.5 w-3.5" /> Greške & Dijagnostika</TabsTrigger>
        </TabsList>

        <TabsContent value="diary">
          <Suspense fallback={fallback}>
            <DiarySection cards={cards} reviewLog={reviewLog} catNameMap={catNameMap} />
          </Suspense>
        </TabsContent>
        <TabsContent value="errors">
          <Suspense fallback={<div className="py-8 text-center text-muted-foreground text-sm">Učitavanje…</div>}>
            <div className="space-y-8 mt-4">
              <FrequentErrors cards={cards} categoryRecords={categoryRecords} onClearErrorLog={onClearErrorLog || (() => {})} embedded />
              <div className="border-t pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="h-4 w-4 text-primary" />
                  <h3 className="text-lg font-medium">Kognitivna dijagnostika</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Analiza interferencija, slijepih tačaka i slabih kuka — sa preporukama za mnemoničku obradu problematičnih kartica.
                </p>
                <CognitiveAnalytics cards={cards} categories={categories} reviewLog={reviewLog} catNameMap={catNameMap} />
              </div>
            </div>
          </Suspense>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
