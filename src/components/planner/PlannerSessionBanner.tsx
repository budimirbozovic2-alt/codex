import { useState } from "react";
import { ClipboardList, X } from "lucide-react";
import type { PlannerSessionHints } from "@/domains/planner/session-hints";

type SessionKind = "learn" | "review";

interface Props {
  kind: SessionKind;
  hints: PlannerSessionHints;
  /** Sections graded in the current session. */
  sessionDelta?: number;
  /** Hard cap chosen at session start (review). */
  sessionCap?: number;
  storageKey: string;
}

export function PlannerSessionBanner({
  kind,
  hints,
  sessionDelta = 0,
  sessionCap,
  storageKey,
}: Props) {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(storageKey) === "1",
  );

  if (!hints.enabled || dismissed) return null;

  const isLearn = kind === "learn";
  const target = isLearn ? hints.learnTarget : (sessionCap ?? hints.reviewRemaining);
  if (target <= 0) return null;

  const progress = isLearn
    ? Math.min(hints.dailyProgress + sessionDelta, hints.learnTarget)
    : sessionDelta;
  const remaining = isLearn
    ? Math.max(0, hints.learnTarget - hints.dailyProgress - sessionDelta)
    : Math.max(0, target - sessionDelta);
  const exhausted = remaining <= 0;

  const label = isLearn
    ? `Planner: ${progress}/${hints.learnTarget} novih cjelina danas`
    : `Planner: ${progress}/${target} ponavljanja u ovoj sesiji`;

  return (
    <div
      className={`flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
        exhausted
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-primary/30 bg-primary/5 text-muted-foreground"
      }`}
      role="status"
    >
      <div className="flex items-start gap-2 min-w-0">
        <ClipboardList className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
        <div className="min-w-0">
          <p className="font-medium text-foreground">{label}</p>
          {hints.focusCategoryName && (
            <p className="text-[10px] mt-0.5 truncate">Fokus: {hints.focusCategoryName}</p>
          )}
          {exhausted && (
            <p className="text-[10px] mt-0.5">
              {isLearn
                ? "Dnevni cilj učenja postignut — sesija je ograničena."
                : "Dnevni budžet ponavljanja iskorišten — sesija je ograničena."}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem(storageKey, "1");
          setDismissed(true);
        }}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Sakrij planner obavijest"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
