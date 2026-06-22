import { Link } from "react-router-dom";
import { AlertTriangle, ShieldCheck, Zap, Brain } from "lucide-react";
import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { Button } from "@/components/ui/button";
import { EndangeredCountBadge } from "@/components/saga/CardMasteryStatusBadge";
import { ENDANGERED_CONCEPT_LABEL } from "@/lib/saga/endangered-display";
import {
  buildEndangeredEssaySummaries,
  formatEndangeredCauseLine,
} from "@/lib/saga/endangered-analysis";
import { buildQuery } from "@/lib/url-params";

interface Props {
  essays: Card[];
  allCards: Card[];
  reviewLog: ReviewLogEntry[];
  /** When set, CTA links to saga-rehab learn session for this category. */
  categoryId?: string;
  maxItems?: number;
  showRehabCta?: boolean;
}

export function EndangeredConceptsPanel({
  essays,
  allCards,
  reviewLog,
  categoryId,
  maxItems = 5,
  showRehabCta = true,
}: Props) {
  if (essays.length === 0) return null;

  const summaries = buildEndangeredEssaySummaries(essays, allCards, reviewLog);
  const visible = summaries.slice(0, maxItems);
  const rehabHref = categoryId
    ? `/learn${buildQuery({ category: categoryId, mode: "saga-rehab" })}`
    : `/learn${buildQuery({ mode: "saga-rehab" })}`;
  const strictRecallHref = categoryId
    ? `/learn${buildQuery({
        category: categoryId,
        mode: "strict-recall",
        type: "essay",
        sort: "weakest",
      })}`
    : `/learn${buildQuery({ mode: "strict-recall", type: "essay", sort: "weakest" })}`;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <h2 className="text-sm font-semibold text-warning uppercase tracking-wider">
            {ENDANGERED_CONCEPT_LABEL}
          </h2>
          <EndangeredCountBadge count={essays.length} />
        </div>
        {showRehabCta && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
              <Link to={strictRecallHref}>
                <Brain className="h-3.5 w-3.5" />
                Aktivno prisjećanje
              </Link>
            </Button>
            <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
              <Link to={rehabHref}>
                <ShieldCheck className="h-3.5 w-3.5" />
                Saniraj sagę
              </Link>
            </Button>
          </div>
        )}
      </div>

      <div className="glass-card rounded-xl p-4 space-y-3 border border-warning/30 bg-warning/5">
        <p className="text-xs text-muted-foreground">
          Esej je označen jer je barem jedan blic satelit dobio ocjenu „Ponovo“. Saniranje =
          esej + saga-flash provjera svih mikro-pitanja.
        </p>
        <ul className="space-y-3">
          {visible.map(({ essay, cause, satelliteCount }) => (
            <li
              key={essay.id}
              className="rounded-lg border border-warning/20 bg-background/60 px-3 py-2.5 space-y-1"
            >
              <p className="text-sm font-medium text-foreground line-clamp-2" title={essay.question}>
                {essay.question || "(Bez pitanja)"}
              </p>
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Zap className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                <span>
                  {formatEndangeredCauseLine(cause)}
                  {satelliteCount > 0 && (
                    <span className="text-muted-foreground/80">
                      {" "}· {satelliteCount} blic{satelliteCount === 1 ? "" : "a"} u sagi
                    </span>
                  )}
                </span>
              </p>
            </li>
          ))}
        </ul>
        {summaries.length > maxItems && (
          <p className="text-xs text-muted-foreground">
            + još {summaries.length - maxItems} ugroženih eseja
          </p>
        )}
      </div>
    </section>
  );
}
