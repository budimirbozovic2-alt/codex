import { Link } from "react-router-dom";
import { RefreshCw, BookOpen, AlertTriangle, CalendarDays } from "lucide-react";
import { buildQuery } from "@/lib/url-params";
import type { SubjectTodayStats } from "@/lib/subject/subject-today-queue";

interface Props {
  categoryId: string;
  stats: SubjectTodayStats;
  onOpenMatrix?: () => void;
}

interface QueueTile {
  key: string;
  count: number;
  label: string;
  hint: string;
  icon: typeof RefreshCw;
  tone: "review" | "learn" | "saga";
  href?: string;
  onClick?: () => void;
}

export function SubjectTodayQueue({ categoryId, stats, onOpenMatrix }: Props) {
  const tiles: QueueTile[] = [
    {
      key: "due",
      count: stats.dueForConsolidation,
      label: "Konsolidacija",
      hint: "Review — FSRS dospjelo",
      icon: RefreshCw,
      tone: "review",
      href: `/review${buildQuery({ category: categoryId })}`,
    },
    {
      key: "unread",
      count: stats.unread,
      label: "Nepročitano",
      hint: "Learn — aktivno prisjećanje",
      icon: BookOpen,
      tone: "learn",
      href: `/learn${buildQuery({
        category: categoryId,
        mode: "strict-recall",
        sort: "leastRead",
      })}`,
    },
    {
      key: "endangered",
      count: stats.endangeredSagas,
      label: "Ugrožene sage",
      hint: "Learn — saniraj sagę",
      icon: AlertTriangle,
      tone: "saga",
      href: `/learn${buildQuery({
        category: categoryId,
        mode: "saga-rehab",
      })}`,
    },
  ];

  return (
    <section className="space-y-3" aria-label="Danas — prioritetni red">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Danas
        </h2>
      </div>

      <div className="glass-card rounded-xl p-4 border border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent space-y-3">
        <p className="text-[11px] text-muted-foreground">
          <strong className="text-foreground">Learn</strong> — čitanje i prisjećanje ·{" "}
          <strong className="text-foreground">Review</strong> — FSRS konsolidacija
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {tiles.map(({ key, count, label, hint, icon: Icon, tone, href, onClick }) => {
            const inner = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Icon className={`h-4 w-4 shrink-0 ${
                    tone === "review" ? "text-primary" : tone === "saga" ? "text-warning" : "text-foreground"
                  }`} />
                  <span className={`text-2xl font-bold tabular-nums ${
                    count > 0 ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-[10px] text-muted-foreground leading-snug">{hint}</p>
              </>
            );
            const className = `rounded-lg border p-3 text-left transition-all ${
              count > 0
                ? "border-border hover:border-primary/40 hover:bg-accent/30"
                : "border-border/60 opacity-60 cursor-default"
            }`;
            if (count === 0) {
              return (
                <div key={key} className={className} aria-disabled>
                  {inner}
                </div>
              );
            }
            if (href) {
              return (
                <Link key={key} to={href} className={className}>
                  {inner}
                </Link>
              );
            }
            return (
              <button key={key} type="button" onClick={onClick} className={className}>
                {inner}
              </button>
            );
          })}
        </div>

        {onOpenMatrix && (
          <button
            type="button"
            onClick={onOpenMatrix}
            className="text-xs text-primary hover:underline"
          >
            Matrični filter (prilagodi Learn sesiju) →
          </button>
        )}
      </div>
    </section>
  );
}
