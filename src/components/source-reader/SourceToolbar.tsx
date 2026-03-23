import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowLeft, Calendar, Wand2, Eye, BarChart3, FileQuestion, List, X } from "lucide-react";
import type { Source } from "@/lib/sources-storage";
import type { ExamQuestion } from "@/components/ExamSidebar";

interface Props {
  source: Source;
  onBack: () => void;
  viewMode: "standard" | "coverage";
  setViewMode: (m: "standard" | "coverage") => void;
  examOpen: boolean;
  setExamOpen: (v: boolean) => void;
  examQuestions: ExamQuestion[];
  outlineOpen: boolean;
  setOutlineOpen: (v: boolean) => void;
  onAutoSplit: () => void;
}

export const SourceToolbar = memo(function SourceToolbar({
  source, onBack, viewMode, setViewMode, examOpen, setExamOpen,
  examQuestions, outlineOpen, setOutlineOpen, onAutoSplit,
}: Props) {
  const isCoverage = viewMode === "coverage";
  const pendingCount = examQuestions.filter(q => !q.done).length;

  return (
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-lg truncate">{source.label}</h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {source.date}
          </span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">v{source.version}</Badge>
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={onAutoSplit} className="gap-1.5" title="Generiši eseje iz članova">
        <Wand2 className="h-3.5 w-3.5" />
        Auto-Split
      </Button>

      <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
        <button
          onClick={() => setViewMode("standard")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            !isCoverage ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Eye className="h-3.5 w-3.5" />
          Čitanje
        </button>
        <button
          onClick={() => setViewMode("coverage")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            isCoverage ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Pokrivenost
        </button>
      </div>

      <Button
        variant={examOpen ? "default" : "outline"}
        size="sm"
        onClick={() => setExamOpen(!examOpen)}
        className="gap-1.5"
        title="Ispitna pitanja sidebar (M)"
      >
        <FileQuestion className="h-3.5 w-3.5" />
        {examOpen ? "Zatvori pitanja" : "Pitanja"}
        <kbd className="hidden sm:inline text-[9px] opacity-60 ml-0.5">M</kbd>
        {pendingCount > 0 && (
          <Badge variant="secondary" className="text-[10px] h-4 min-w-4 px-1">
            {pendingCount}
          </Badge>
        )}
      </Button>

      <Button variant="outline" size="sm" onClick={() => setOutlineOpen(!outlineOpen)} className="gap-1.5">
        {outlineOpen ? <X className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
        {outlineOpen ? "Zatvori" : "Sadržaj"}
      </Button>
    </div>
  );
});
