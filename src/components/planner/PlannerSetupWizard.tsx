import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, ArrowLeft, ArrowRight, Check, Clock, Shield } from "lucide-react";
import { format, startOfDay, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { PlannerConfig, generateStudyPlan } from "@/lib/planner-storage";
import { CategoryRecord } from "@/lib/db";
import { Card as SRCard } from "@/lib/spaced-repetition";
import SubjectCard from "./SubjectCard";

interface Props {
  config: PlannerConfig;
  save: (c: PlannerConfig) => void;
  categoryRecords: CategoryRecord[];
  cards: SRCard[];
  onClose: () => void;
}

export default function PlannerSetupWizard({ config, save, categoryRecords, cards, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [goalDate, setGoalDate] = useState<Date | undefined>(config.finalGoalDate ? new Date(config.finalGoalDate) : undefined);
  const [dailyHours, setDailyHours] = useState(config.dailyAvailableMinutes > 0 ? config.dailyAvailableMinutes / 60 : 4);
  const [buffer, setBuffer] = useState(config.bufferPercent);
  const [hardSubjects, setHardSubjects] = useState<string[]>(config.hardSubjects || []);

  const toggleHard = (id: string) => {
    setHardSubjects(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const draftConfig: PlannerConfig = {
    ...config,
    finalGoalDate: goalDate ? goalDate.toISOString().slice(0, 10) : null,
    dailyAvailableMinutes: Math.round(dailyHours * 60),
    bufferPercent: buffer,
    hardSubjects,
    subjectOrder: categoryRecords.map(r => r.id),
  };

  const previewPlans = step === 2 ? generateStudyPlan(draftConfig, categoryRecords, cards) : [];

  const canProceed = step === 0 ? !!goalDate : true;

  const handleFinish = () => {
    save(draftConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg mx-4 rounded-xl border bg-card shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b">
          <h2 className="text-lg font-semibold">Podešavanje plana učenja</h2>
          <div className="flex gap-1 mt-3">
            {[0, 1, 2].map(i => (
              <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-secondary")} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {step === 0 && "Korak 1/3 — Parametri"}
            {step === 1 && "Korak 2/3 — Težina predmeta"}
            {step === 2 && "Korak 3/3 — Pregled plana"}
          </p>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[60vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                {/* Exam date */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" /> Datum ispita
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start", !goalDate && "text-muted-foreground")}>
                        {goalDate ? format(goalDate, "dd.MM.yyyy") : "Odaberi datum ispita"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarUI
                        mode="single" selected={goalDate} onSelect={setGoalDate}
                        disabled={(d) => d < startOfDay(new Date())} initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  {goalDate && (
                    <p className="text-xs text-muted-foreground">{differenceInDays(goalDate, new Date())} dana do ispita</p>
                  )}
                </div>

                {/* Daily hours */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" /> Dnevno raspoloživo vrijeme
                  </label>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[dailyHours]}
                      onValueChange={([v]) => setDailyHours(v)}
                      min={1} max={8} step={0.5}
                      className="flex-1"
                    />
                    <span className="text-lg font-medium tabular-nums w-12 text-right">{dailyHours}h</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>1h</span><span>8h</span>
                  </div>
                </div>

                {/* Buffer */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" /> Sigurnosna zona (Buffer)
                  </label>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[buffer]}
                      onValueChange={([v]) => setBuffer(v)}
                      min={0} max={30} step={5}
                      className="flex-1"
                    />
                    <span className="text-lg font-medium tabular-nums w-12 text-right">{buffer}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Sistem računa kao da ispit počinje {buffer}% ranije, ostavljajući krajnji period za finalno ponavljanje.</p>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
                <p className="text-sm text-muted-foreground">Označi predmete koje smatraš posebno teškim. Oni će dobiti 50% više vremena u rasporedu.</p>
                {categoryRecords.map(cat => {
                  const catCards = cards.filter(c => c.categoryId === cat.id);
                  const sections = catCards.reduce((s, c) => s + c.sections.length, 0);
                  return (
                    <div key={cat.id} className="flex items-center justify-between p-3 rounded-lg border bg-secondary/30">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{cat.name}</p>
                        <p className="text-xs text-muted-foreground">{catCards.length} kartica • {sections} cjelina</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {hardSubjects.includes(cat.id) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium">1.5×</span>
                        )}
                        <Switch
                          checked={hardSubjects.includes(cat.id)}
                          onCheckedChange={() => toggleHard(cat.id)}
                        />
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
                <p className="text-sm text-muted-foreground">Sistem je automatski generisao raspored na osnovu tvojih parametara. Klikni na predmet za detalje.</p>
                {previewPlans.length > 0 ? (
                  previewPlans.map((plan, i) => (
                    <SubjectCard key={plan.categoryId} plan={plan} index={i} />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nema podataka za generisanje plana. Provjeri da li imaš kartice u kategorijama.</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-5 border-t flex items-center justify-between">
          <div>
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" /> Nazad
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Otkaži</Button>
            {step < 2 ? (
              <Button size="sm" onClick={() => setStep(s => s + 1)} disabled={!canProceed} className="gap-1.5">
                Dalje <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleFinish} className="gap-1.5">
                <Check className="h-3.5 w-3.5" /> Potvrdi plan
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
