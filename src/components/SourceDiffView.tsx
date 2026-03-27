import { useMemo, useState } from "react";







import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { DiffResult, ArticleDiff, DiffSegment } from "@/lib/article-parser";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import Check from "lucide-react/dist/esm/icons/check";
import Plus from "lucide-react/dist/esm/icons/plus";
import Minus from "lucide-react/dist/esm/icons/minus";
import Edit3 from "lucide-react/dist/esm/icons/edit3";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert";
import Columns from "lucide-react/dist/esm/icons/columns";
import AlignLeft from "lucide-react/dist/esm/icons/align-left";
import Eye from "lucide-react/dist/esm/icons/eye";
interface Props {
  diffResult: DiffResult;
  sourceName: string;
  oldVersion: number;
  newVersion: number;
  affectedCardCount: number;
  onClose: () => void;
}

const STATUS_CONFIG = {
  modified: { label: "Izmijenjeno", color: "bg-warning/15 text-warning border-warning/30", icon: Edit3, dotColor: "bg-warning", headerBg: "bg-warning/5 border-warning/20" },
  added: { label: "Novi član", color: "bg-success/15 text-success border-success/30", icon: Plus, dotColor: "bg-success", headerBg: "bg-success/5 border-success/20" },
  removed: { label: "Obrisani član", color: "bg-destructive/15 text-destructive border-destructive/30", icon: Minus, dotColor: "bg-destructive", headerBg: "bg-destructive/5 border-destructive/20" },
  unchanged: { label: "Nepromijenjeno", color: "bg-secondary text-muted-foreground border-border", icon: Check, dotColor: "bg-muted-foreground", headerBg: "bg-secondary/50" },
} as const;

type ViewMode = "side-by-side" | "inline";

/* ── Inline diff renderer ── */
function InlineDiffContent({ segments }: { segments: DiffSegment[] }) {
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap">
      {segments.map((seg, i) => {
        if (seg.type === "equal") return <span key={i} className="text-foreground/70">{seg.text}</span>;
        if (seg.type === "insert") {
          return <span key={i} className="bg-success/20 text-success-foreground border-b-2 border-success/40 rounded-sm px-0.5">{seg.text}</span>;
        }
        if (seg.type === "delete") {
          return <span key={i} className="bg-destructive/20 text-destructive line-through rounded-sm px-0.5">{seg.text}</span>;
        }
        return null;
      })}
    </div>
  );
}

/* ── Side-by-side diff renderer ── */
function SideBySideDiffContent({ segments }: { segments: DiffSegment[] }) {
  const { leftParts, rightParts } = useMemo(() => {
    const left: { text: string; type: "normal" | "removed" }[] = [];
    const right: { text: string; type: "normal" | "added" }[] = [];
    for (const seg of segments) {
      if (seg.type === "equal") {
        left.push({ text: seg.text, type: "normal" });
        right.push({ text: seg.text, type: "normal" });
      } else if (seg.type === "delete") {
        left.push({ text: seg.text, type: "removed" });
      } else if (seg.type === "insert") {
        right.push({ text: seg.text, type: "added" });
      }
    }
    return { leftParts: left, rightParts: right };
  }, [segments]);

  return (
    <div className="grid grid-cols-2 gap-0 border rounded-lg overflow-hidden">
      <div className="border-r">
        <div className="px-3 py-1.5 bg-destructive/5 border-b">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive/70">Stara verzija</span>
        </div>
        <div className="p-3 text-sm leading-relaxed whitespace-pre-wrap">
          {leftParts.map((part, i) => (
            <span key={i} className={part.type === "removed"
              ? "bg-destructive/15 text-destructive line-through decoration-destructive/50 rounded-sm px-0.5"
              : "text-foreground/80"
            }>{part.text}</span>
          ))}
        </div>
      </div>
      <div>
        <div className="px-3 py-1.5 bg-success/5 border-b">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-success/70">Nova verzija</span>
        </div>
        <div className="p-3 text-sm leading-relaxed whitespace-pre-wrap">
          {rightParts.map((part, i) => (
            <span key={i} className={part.type === "added"
              ? "bg-success/15 text-success-foreground font-medium rounded-sm px-0.5 border-b-2 border-success/30"
              : "text-foreground/80"
            }>{part.text}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Full article content (added/removed) ── */
function FullArticleContent({ text, status }: { text: string; status: "added" | "removed" }) {
  const isAdded = status === "added";
  return (
    <div className={`rounded-lg border overflow-hidden ${isAdded ? "border-success/30" : "border-destructive/30"}`}>
      <div className={`px-3 py-1.5 border-b ${isAdded ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"}`}>
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${isAdded ? "text-success/70" : "text-destructive/70"}`}>
          {isAdded ? "Novi tekst" : "Uklonjeni tekst"}
        </span>
      </div>
      <div className={`p-3 text-sm leading-relaxed whitespace-pre-wrap ${isAdded ? "bg-success/5 text-foreground/80" : "bg-destructive/5 text-foreground/50 line-through"}`}>
        {text}
      </div>
    </div>
  );
}

/* ── Article card with "Promjena u Članu [X]" header ── */
function DiffArticleCard({ diff, defaultExpanded, viewMode }: { diff: ArticleDiff; defaultExpanded: boolean; viewMode: ViewMode }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const config = STATUS_CONFIG[diff.status];
  const Icon = config.icon;

  const headerLabel = diff.status === "modified"
    ? `Promjena u ${diff.articleTitle}`
    : diff.status === "added"
    ? `NOVI ČLAN: ${diff.articleTitle}`
    : diff.status === "removed"
    ? `OBRISANI ČLAN: ${diff.articleTitle}`
    : diff.articleTitle;

  const borderColor = diff.status === "modified"
    ? "border-l-warning"
    : diff.status === "added"
    ? "border-l-success"
    : diff.status === "removed"
    ? "border-l-destructive"
    : "border-l-muted-foreground";

  return (
    <div className={`rounded-lg border overflow-hidden border-l-4 ${borderColor}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left ${config.headerBg}`}
      >
        <Icon className={`h-4 w-4 flex-shrink-0 ${
          diff.status === "modified" ? "text-warning" :
          diff.status === "added" ? "text-success" :
          diff.status === "removed" ? "text-destructive" : "text-muted-foreground"
        }`} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold">{headerLabel}</span>
        </div>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${config.color}`}>
          {config.label}
        </Badge>
        {expanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        }
      </button>

      {expanded && diff.status !== "unchanged" && (
        <div className="border-t px-4 py-3 bg-card">
          {diff.status === "added" && <FullArticleContent text={diff.newText || diff.segments.map(s => s.text).join("")} status="added" />}
          {diff.status === "removed" && <FullArticleContent text={diff.oldText || diff.segments.map(s => s.text).join("")} status="removed" />}
          {diff.status === "modified" && (
            viewMode === "side-by-side"
              ? <SideBySideDiffContent segments={diff.segments} />
              : <InlineDiffContent segments={diff.segments} />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main view ── */
export default function SourceDiffView({ diffResult, sourceName, oldVersion, newVersion, affectedCardCount, onClose }: Props) {
  const [filterStatus, setFilterStatus] = useState<"all" | "modified" | "added" | "removed">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    let items = diffResult.diffs;
    // By default hide unchanged unless showAll is on
    if (!showAll) {
      items = items.filter(d => d.status !== "unchanged");
    }
    if (filterStatus !== "all") {
      items = items.filter(d => d.status === filterStatus);
    }
    return items;
  }, [diffResult, filterStatus, showAll]);

  const { summary } = diffResult;
  const totalChanges = summary.modified + summary.added + summary.removed;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-lg">Poređenje verzija</h2>
          <p className="text-xs text-muted-foreground">
            {sourceName} — v{oldVersion} → v{newVersion} · {totalChanges} {totalChanges === 1 ? "promjena" : "promjena"}
          </p>
        </div>
        <div className="flex items-center gap-1 border rounded-md p-0.5">
          <button
            onClick={() => setViewMode("side-by-side")}
            className={`p-1.5 rounded transition-colors ${viewMode === "side-by-side" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Uporedno (side-by-side)"
          >
            <Columns className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode("inline")}
            className={`p-1.5 rounded transition-colors ${viewMode === "inline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Inline prikaz"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard label="Izmijenjeno" count={summary.modified} color="text-warning bg-warning/10" />
        <SummaryCard label="Novo" count={summary.added} color="text-success bg-success/10" />
        <SummaryCard label="Uklonjeno" count={summary.removed} color="text-destructive bg-destructive/10" />
      </div>

      {/* Affected cards notice */}
      {affectedCardCount > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-warning/30 bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
          <p className="text-sm">
            <strong className="text-foreground">{affectedCardCount} kartica</strong>
            <span className="text-muted-foreground"> je označeno za provjeru jer su povezane sa izmijenjenim članovima.</span>
          </p>
        </div>
      )}

      {/* Filter tabs + Show all toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["all", "modified", "added", "removed"] as const).map(status => {
            const labels = { all: "Sve promjene", modified: "Izmijenjeno", added: "Novo", removed: "Uklonjeno" };
            const counts = { all: totalChanges, modified: summary.modified, added: summary.added, removed: summary.removed };
            return (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  filterStatus === status
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {labels[status]} ({counts[status]})
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Eye className="h-3.5 w-3.5" />
          <span>Prikaži sve</span>
          <Switch checked={showAll} onCheckedChange={setShowAll} className="scale-75" />
        </label>
      </div>

      {/* Diff list */}
      <div className="space-y-2">
        {filtered.map(diff => (
          <DiffArticleCard
            key={diff.articleId}
            diff={diff}
            defaultExpanded={diff.status === "modified"}
            viewMode={viewMode}
          />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Check className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nema promjena za prikazivanje.</p>
            {!showAll && summary.unchanged > 0 && (
              <p className="text-xs mt-1">Uključite "Prikaži sve" da vidite {summary.unchanged} nepromijenjenih članova.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`rounded-lg p-3 ${color}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-xs mt-0.5 opacity-80">{label}</p>
    </div>
  );
}
