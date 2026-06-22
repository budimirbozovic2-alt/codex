import { useState } from "react";
import { Link } from "react-router-dom";
import { Gauge, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import {
  READINESS_LEVEL_LABELS,
  type SubjectReadinessBreakdown,
} from "@/lib/subject/readiness-score";
import { cn } from "@/lib/utils";
import { buildQuery } from "@/lib/url-params";
import { SUBJECT_COMPACT_PANEL_CLASS } from "@/components/subject/SubjectCompactPanel";

interface Props {
  categoryId: string;
  readiness: SubjectReadinessBreakdown;
  variant?: "default" | "compact";
}

const LEVEL_RING: Record<SubjectReadinessBreakdown["level"], string> = {
  visoka: "text-success border-success/40",
  solidna: "text-primary border-primary/40",
  umjerena: "text-warning border-warning/40",
  niska: "text-orange-500 border-orange-500/40",
  "kritična": "text-destructive border-destructive/40",
};

const LEVEL_BAR: Record<SubjectReadinessBreakdown["level"], string> = {
  visoka: "bg-success",
  solidna: "bg-primary",
  umjerena: "bg-warning",
  niska: "bg-orange-500",
  "kritična": "bg-destructive",
};

function ComponentBar({ label, value, pct }: { label: string; value: number; pct: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{value} · {pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/70 transition-all"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function RiskLinks({
  categoryId,
  readiness,
}: {
  categoryId: string;
  readiness: SubjectReadinessBreakdown;
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {readiness.risks.some((r) => r.code === "errors") && (
        <Link
          to={`/subject/${categoryId}/diagnostics`}
          className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
        >
          Najčešće greške
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
      {readiness.risks.some((r) => r.code === "endangered") && (
        <a
          href="#endangered-concepts"
          className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
        >
          Ugroženi koncepti
          <ChevronRight className="h-3 w-3" />
        </a>
      )}
      {(readiness.risks.some((r) => r.code.startsWith("planner")) || readiness.coveragePct < 50) && (
        <Link
          to={`/planner${buildQuery({ category: categoryId })}`}
          className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
        >
          Planer
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

export function SubjectReadinessCard({ categoryId, readiness, variant = "default" }: Props) {
  const [risksOpen, setRisksOpen] = useState(false);
  const ringClass = LEVEL_RING[readiness.level];
  const barClass = LEVEL_BAR[readiness.level];
  const topRisks = readiness.risks.slice(0, 3);

  if (variant === "compact") {
    return (
      <section className={SUBJECT_COMPACT_PANEL_CLASS} aria-label="Spremnost predmeta">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-base font-bold tabular-nums",
              ringClass,
            )}
          >
            {readiness.score}
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Gauge className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground truncate">
                  {READINESS_LEVEL_LABELS[readiness.level]}
                </span>
                <span className="text-[10px] text-muted-foreground hidden sm:inline">· Spremnost</span>
              </div>
              {topRisks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setRisksOpen((v) => !v)}
                  className="inline-flex items-center gap-0.5 text-[10px] text-warning shrink-0 hover:underline"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {topRisks.length} rizik{topRisks.length > 1 ? "a" : ""}
                  <ChevronDown className={cn("h-3 w-3 transition-transform", risksOpen && "rotate-180")} />
                </button>
              )}
            </div>

            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", barClass)}
                style={{ width: `${readiness.score}%` }}
              />
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground tabular-nums">
              <span>Pokrivenost {readiness.coveragePct}%</span>
              <span>Zadržavanje {readiness.retentionPct}%</span>
              <span>Zdravlje {readiness.healthPct}%</span>
              {readiness.plannerAdjustment > 0 && (
                <span className="text-warning">Planer −{readiness.plannerAdjustment}</span>
              )}
            </div>
          </div>
        </div>

        {risksOpen && topRisks.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5">
            <ul className="space-y-0.5">
              {topRisks.map((r) => (
                <li
                  key={r.code}
                  className={cn(
                    "text-xs",
                    r.severity === "critical" ? "text-destructive" : "text-warning",
                  )}
                >
                  {r.label}
                </li>
              ))}
            </ul>
            <RiskLinks categoryId={categoryId} readiness={readiness} />
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-label="Spremnost predmeta">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Gauge className="h-4 w-4 text-primary" />
        Spremnost
      </h2>

      <div className="glass-card rounded-xl p-5 border border-border/60 space-y-4">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 text-xl font-bold tabular-nums",
              ringClass,
            )}
          >
            {readiness.score}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {READINESS_LEVEL_LABELS[readiness.level]}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Procjena spremnosti za ispit na osnovu pokrivenosti gradiva, FSRS zadržavanja i rizičnih zona
              (greške, leech, ugroženi koncepti).
            </p>
            {readiness.plannerAdjustment > 0 && (
              <p className="text-[10px] text-warning">
                −{readiness.plannerAdjustment} poena zbog kašnjenja u planeru
              </p>
            )}
          </div>
        </div>

        <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", barClass)}
            style={{ width: `${readiness.score}%` }}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <ComponentBar label="Pokrivenost" value={readiness.coverage} pct={readiness.coveragePct} />
          <ComponentBar label="Zadržavanje" value={readiness.retention} pct={readiness.retentionPct} />
          <ComponentBar label="Zdravlje" value={readiness.health} pct={readiness.healthPct} />
        </div>

        {topRisks.length > 0 && (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              Rizici
            </p>
            <ul className="space-y-1">
              {topRisks.map((r) => (
                <li
                  key={r.code}
                  className={cn(
                    "text-xs",
                    r.severity === "critical" ? "text-destructive" : "text-warning",
                  )}
                >
                  {r.label}
                </li>
              ))}
            </ul>
            <RiskLinks categoryId={categoryId} readiness={readiness} />
          </div>
        )}
      </div>
    </section>
  );
}
