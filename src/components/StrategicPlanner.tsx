import { Target, BarChart3, Map as MapIcon } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import InfoPanel from "@/components/InfoPanel";
import { Card as SRCard } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { usePlannerData } from "@/hooks/usePlannerData";
import OperationsTab from "./planner/OperationsTab";
import RoadmapTab from "./planner/RoadmapTab";
import DisciplineTab from "./planner/DisciplineTab";

interface Props {
  cards: SRCard[];
  categories: string[];
  reviewLog: ReviewLogEntry[];
  onNavigateToDatabase?: (category: string) => void;
}

export default function StrategicPlanner({ cards, categories, reviewLog, onNavigateToDatabase }: Props) {
  const data = usePlannerData(cards, reviewLog);
  const [activeTab, setActiveTab] = useState<"operations" | "roadmap" | "discipline">("operations");

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="imperial-title">Strateški planer</h2>
            <p className="text-muted-foreground mt-1">Adaptivni sistem — plan se prilagođava tvom tempu</p>
          </div>
          <InfoPanel title="Kako radi Strateški planer?">
            <p><strong className="text-foreground">Operativni plan</strong> — faze učenja sa dinamičkim datumima, Smart Load Balancing (dnevna kvota = preostalo / efektivni dani), Reality Check i dnevne sugestije.</p>
            <p><strong className="text-foreground">Faze učenja</strong> — grupišu kategorije. Datumi se automatski prilagođavaju tvom tempu (Velocity).</p>
            <p><strong className="text-foreground">Buffer %</strong> — sigurnosna zona (podrazumijevano 15%) — sistem računa kao da ispit počinje ranije, ostavljajući krajnji period za finalno ponavljanje.</p>
            <p><strong className="text-foreground">Niveliši plan</strong> — raspoređuje kognitivni dug ravnomjerno na preostale dane, resetujući status u zeleni.</p>
            <p><strong className="text-foreground">Mapa puta</strong> — Burn-up grafikon (idealna vs. stvarna linija napretka) i tekstualna simulacija završetka.</p>
            <p><strong className="text-foreground">Disciplina</strong> — Rocket Streak (🚀 uzastopni dani), 14-dnevni grid sa emojijima i trend dosljednosti.</p>
            <p><strong className="text-foreground">Burnout zaštita</strong> — upozorenje ako dnevna kvota pređe 60 kartica.</p>
          </InfoPanel>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 mt-4 p-1 rounded-lg bg-secondary/50">
          {([
            { key: "operations" as const, label: "Operativni plan", icon: Target },
            { key: "roadmap" as const, label: "Mapa puta", icon: MapIcon },
            { key: "discipline" as const, label: "Disciplina", icon: BarChart3 },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all",
                activeTab === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {activeTab === "operations" && (
        <OperationsTab
          config={data.config}
          save={data.save}
          categories={categories}
          phaseProgressList={data.phaseProgressList}
          dynamicDates={data.dynamicDates}
          totalTimelineDays={data.totalTimelineDays}
          velocity={data.velocity}
          remaining={data.remaining}
          estimatedFinish={data.estimatedFinish}
          plannerStatus={data.plannerStatus}
          smartSuggestion={data.smartSuggestion}
          timeRec={data.timeRec}
          debt={data.debt}
          dueCount={data.dueCount}
          onNavigateToDatabase={onNavigateToDatabase}
        />
      )}

      {activeTab === "roadmap" && (
        <RoadmapTab
          burnupData={data.burnupData}
          projectionText={data.projectionText}
          velocity={data.velocity}
          remaining={data.remaining}
          totalSections={data.totalSections}
          phaseProgressList={data.phaseProgressList}
          bufferPercent={data.config.bufferPercent}
        />
      )}

      {activeTab === "discipline" && (
        <DisciplineTab
          disciplineLog={data.disciplineLog}
          disciplineTrend={data.disciplineTrend}
          streak={data.streak}
          bestStreak={data.bestStreak}
          currentPhase={data.currentPhase}
          phaseDisciplinePct={data.phaseDisciplinePct}
        />
      )}
    </div>
  );
}
