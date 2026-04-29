import { useParams, Link, useNavigate } from "react-router-dom";
import { useCardData, useCategoryData, useCardActions } from "@/contexts/AppContext";
import { useMemo, useState } from "react";
import {
  ArrowLeft, BookMarked, Brain, RefreshCw, BarChart3,
  Info, Settings, Network, BookOpen, Layers,
} from "lucide-react";
import ExaminerProfileDialog from "@/components/ExaminerProfileDialog";
import MatrixFilterDialog, { type MatrixFilters } from "@/components/learn/MatrixFilterDialog";
import type { ExaminerProfile } from "@/lib/db";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { getCardMasteryLevel, getMasteryColor, MASTERY_LEVELS } from "@/lib/mastery";
import { SectionState } from "@/lib/spaced-repetition";

export default function SubjectDashboard() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const { categoryRecords } = useCategoryData();
  const { cards } = useCardData();

  const categoryRec = useMemo(
    () => categoryRecords.find(r => r.id === categoryId),
    [categoryRecords, categoryId],
  );
  const categoryName = categoryRec?.name ?? "Nepoznat predmet";

  const { updateExaminerProfile } = useCardActions();
  const [infoOpen, setInfoOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const navigate = useNavigate();

  const subjectCards = useMemo(
    () => cards.filter(c => c.categoryId === categoryId),
    [cards, categoryId],
  );
  const subjectSubcategories = useMemo(
    () => (categoryRec?.subcategories ?? []).map(s => ({ id: s.id, name: s.name })),
    [categoryRec],
  );

  const handleMatrixStart = (f: MatrixFilters) => {
    const params = new URLSearchParams();
    if (categoryId) params.set("category", categoryId);
    params.set("mode", "strict-recall");
    if (f.subcategoryId) params.set("subcategory", f.subcategoryId);
    params.set("type", f.type);
    params.set("freq", f.frequencyTag);
    params.set("sort", f.sortMode);
    navigate(`/learn?${params.toString()}`);
  };

  // ─── Knowledge progress data ──────────────────────────
  const subProgressData = useMemo(() => {
    if (!categoryId || !categoryRec) return [];
    const catCards = cards.filter(c => c.categoryId === categoryId);
    const subs = categoryRec.subcategories ?? [];

    return subs.map(sub => {
      const subCards = catCards.filter(c => c.subcategoryId === sub.id);
      const totalSections = subCards.reduce((s, c) => s + (c.sections?.length ?? 0), 0);
      const learnedSections = subCards.reduce(
        (s, c) => s + (c.sections?.filter(sec => sec.state !== SectionState.New).length ?? 0), 0,
      );
      const pct = totalSections > 0 ? Math.round((learnedSections / totalSections) * 100) : 0;
      const avgMastery = subCards.length > 0
        ? Math.round(subCards.reduce((s, c) => s + getCardMasteryLevel(c), 0) / subCards.length)
        : 0;

      const chapters = (sub.chapters ?? []).map(ch => {
        const chCards = subCards.filter(c => c.chapterId === ch.id);
        const chTotal = chCards.reduce((s, c) => s + (c.sections?.length ?? 0), 0);
        const chLearned = chCards.reduce(
          (s, c) => s + (c.sections?.filter(sec => sec.state !== SectionState.New).length ?? 0), 0,
        );
        const chPct = chTotal > 0 ? Math.round((chLearned / chTotal) * 100) : 0;
        const chMastery = chCards.length > 0
          ? Math.round(chCards.reduce((s, c) => s + getCardMasteryLevel(c), 0) / chCards.length)
          : 0;
        return { id: ch.id, name: ch.name, cardCount: chCards.length, pct: chPct, mastery: chMastery };
      });

      return { id: sub.id, name: sub.name, cardCount: subCards.length, pct, mastery: avgMastery, chapters };
    });
  }, [categoryId, categoryRec, cards]);

  const knowledgeBaseCards = useMemo(() => [
    {
      to: `/subject/${categoryId}/zettelkasten`,
      icon: Network,
      title: "Zettelkasten",
      desc: "Baza znanja i mentalne mape",
    },
    {
      to: `/category/${categoryId}`,
      icon: BookOpen,
      title: "Izvori",
      desc: "Zakoni, skripte i fokusirano čitanje",
    },
    {
      to: `/subject/${categoryId}/cards`,
      icon: Layers,
      title: "Kartice",
      desc: "Upravljanje karticama, struktura i mnemonika",
    },
  ], [categoryId]);

  const coreActions = useMemo(() => [
    {
      onClick: () => setMatrixOpen(true),
      icon: Brain,
      title: "Učenje uz aktivno prisjećanje",
      desc: "Matrični filter — testiranje i učvršćivanje znanja",
    },
    {
      to: `/review?category=${categoryId}`,
      icon: RefreshCw,
      title: "Konsolidacija znanja",
      desc: "Ponavljanje dospjelih kartica iz ovog predmeta",
    },
  ], [categoryId]);

  return (
    <div className="space-y-8">
      {/* ─── Header + Meta Tools ─────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Nazad na početnu"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground truncate">{categoryName}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Dashboard predmeta</p>
          </div>
        </div>

        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-1.5 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9" asChild>
                  <Link to="/stats">
                    <BarChart3 className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Statistika</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setInfoOpen(true)}
                  aria-label="Informacije o predmetu"
                >
                  <Info className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Informacije o predmetu</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9" asChild>
                  <Link to={`/settings?tab=algorithm&subject=${categoryId}`}>
                    <Settings className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Podešavanja</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      <ExaminerProfileDialog
        open={infoOpen}
        onOpenChange={setInfoOpen}
        categoryName={categoryName}
        initialProfile={categoryRec?.examinerProfile}
        onSave={(profile: ExaminerProfile) => {
          if (categoryId) updateExaminerProfile(categoryId, profile);
        }}
      />

      {/* ─── Prikaz Znanja ───────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Prikaz Znanja
          </h2>
        </div>

        {subProgressData.length === 0 ? (
          <div className="glass-card rounded-xl p-6 text-center text-sm text-muted-foreground">
            Nema potkategorija za ovaj predmet. Dodaj ih u Podešavanjima.
          </div>
        ) : (
          <div className="space-y-2">
            {subProgressData.map(sub => (
              <div key={sub.id} className="glass-card rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{sub.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: getMasteryColor(sub.mastery) + "22", color: getMasteryColor(sub.mastery) }}
                    >
                      {MASTERY_LEVELS[sub.mastery]?.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{sub.cardCount} kartica</span>
                    <span className="text-xs font-medium text-foreground w-8 text-right">{sub.pct}%</span>
                  </div>
                </div>
                <Progress value={sub.pct} className="h-1.5" style={{ "--progress-color": getMasteryColor(sub.mastery) } as React.CSSProperties} />

                {sub.chapters.length > 0 && (
                  <div className="pl-4 space-y-1.5 pt-1 border-l border-border/40 ml-1">
                    {sub.chapters.map(ch => (
                      <div key={ch.id} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground truncate flex-1">{ch.name}</span>
                        <span className="text-[10px] text-muted-foreground w-6 text-right">{ch.cardCount}</span>
                        <div className="w-20">
                          <Progress value={ch.pct} className="h-1" style={{ "--progress-color": getMasteryColor(ch.mastery) } as React.CSSProperties} />
                        </div>
                        <span className="text-[10px] font-medium text-foreground w-7 text-right">{ch.pct}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Baza i Izvori znanja ────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Baza i Izvori znanja
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {knowledgeBaseCards.map(({ to, icon: Icon, title, desc }) => (
            <Link
              key={title}
              to={to}
              className="glass-card rounded-xl p-5 flex items-start gap-4 hover:border-primary/40 transition-all group"
            >
              <div className="p-2.5 rounded-lg bg-secondary text-muted-foreground shrink-0 group-hover:text-foreground transition-colors">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── Alati za učenje ─────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Alati za učenje
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {coreActions.map(({ to, onClick, icon: Icon, title, desc }) => {
            const inner = (
              <>
                <div className="p-3 rounded-lg bg-primary/10 text-primary shrink-0 group-hover:bg-primary/15 transition-colors">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="font-bold text-base text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                </div>
              </>
            );
            const className = "glass-card rounded-xl p-6 flex items-start gap-4 hover:border-primary/40 transition-all group border-primary/20";
            return onClick ? (
              <button key={title} type="button" onClick={onClick} className={className}>{inner}</button>
            ) : (
              <Link key={title} to={to!} className={className}>{inner}</Link>
            );
          })}
        </div>
      </section>

      <MatrixFilterDialog
        open={matrixOpen}
        onOpenChange={setMatrixOpen}
        categoryName={categoryName}
        cards={subjectCards}
        subcategories={subjectSubcategories}
        onStart={handleMatrixStart}
      />
    </div>
  );
}
