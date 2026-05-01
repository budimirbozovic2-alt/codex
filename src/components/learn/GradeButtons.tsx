import React from "react";
import { Button } from "@/components/ui/button";
import { GRADE_LABELS, GRADE_DESCRIPTIONS, GRADE_COLORS } from "./types";

interface Props {
  onGrade: (grade: number) => void;
  hint?: string;
  /**
   * Hard safety gate. When false, the grading buttons render as disabled and
   * cannot trigger `onGrade`. This guarantees FSRS cannot be fed a grade
   * before the user explicitly reveals the answer (Active Recall principle).
   */
  enabled?: boolean;
}

const GradeButtons = React.memo(function GradeButtons({ onGrade, hint, enabled = true }: Props) {
  return (
    <div>
      {hint && <p className="text-xs text-muted-foreground mb-2 text-center">{hint}</p>}
      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Ocjena prisjećanja">
        {[1, 2, 3, 4].map((g) => (
          <Button
            key={g}
            onClick={() => { if (enabled) onGrade(g); }}
            disabled={!enabled}
            aria-disabled={!enabled}
            className={`${GRADE_COLORS[g]} border-0 flex-col h-auto py-2 disabled:opacity-40 disabled:cursor-not-allowed`}
            variant="outline"
          >
            <span className="font-bold">{g} — {GRADE_LABELS[g]}</span>
            <span className="text-[10px] opacity-75 font-normal">{GRADE_DESCRIPTIONS[g]}</span>
          </Button>
        ))}
      </div>
    </div>
  );
});

export default GradeButtons;
