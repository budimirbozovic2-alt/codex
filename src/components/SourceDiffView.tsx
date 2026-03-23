import { useMemo, useState } from "react";
import { default as ArrowLeft } from "lucide-react/dist/esm/icons/arrow-left";
import { default as Check } from "lucide-react/dist/esm/icons/check";
import { default as Plus } from "lucide-react/dist/esm/icons/plus";
import { default as Minus } from "lucide-react/dist/esm/icons/minus";
import { default as Edit3 } from "lucide-react/dist/esm/icons/edit-3";
import { default as ChevronDown } from "lucide-react/dist/esm/icons/chevron-down";
import { default as ChevronRight } from "lucide-react/dist/esm/icons/chevron-right";
import { default as AlertTriangle } from "lucide-react/dist/esm/icons/alert-triangle";
import { default as Columns } from "lucide-react/dist/esm/icons/columns";
import { default as AlignLeft } from "lucide-react/dist/esm/icons/align-left";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DiffResult, ArticleDiff, DiffSegment } from "@/lib/article-parser";

interface Props {
  diffResult: DiffResult;
  sourceName: string;
  oldVersion: number;
  newVersion: number;
  affectedCardCount: number;
  onClose: () => void;
}

const STATUS_CONFIG = {
  modified: { label: "Izmijenjeno", color: "bg-warning/15 text-warning border-warning/30", icon: Edit3, dotColor: "bg-warning" },
  added: { label: "Novo", color: "bg-success/15 text-success border-success/30", icon: Plus, dotColor: "bg-success" },
  removed: { label: "Uklonjeno", color: "bg-destructive/15 text-destructive border-destructive/30", icon: Minus, dotColor: "bg-destructive" },
  unchanged: { label: "Nepromijenjeno", color: "bg-secondary text-muted-foreground border-border", icon: Check, dotColor: "bg-muted-foreground" },
} as const;

type ViewMode = "side-by-side" | "inline";

/* ── Inline diff renderer (compact) ── */
function InlineDiffContent({ segments }: { segments: DiffSegment[] }) {
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap">
      {segments.map((seg, i) => {
        if (seg.type === "equal") {
          return <span key={i} className="text-foreground/70">{seg.text}</span>;
        }
        if (seg.type === "insert") {
          return (
            <span key={i} className="bg-success/20 text-success-foreground border-b-2 border-success/40 rounded-sm px-0.5">
              {seg.text}
            </span>
          );
        }
        if (seg.type === "delete") {
          return (
            <span key={i} className="bg-destructive/20 text-destructive line-through rounded-sm px-0.5">
              {seg.text}
            </span>
          );
        }
        return null;
      })}
    </div>
  );
}

/* ── Side-by-side diff renderer (clear) ── */
function SideBySideDiffContent({ segments, oldText, newText }: { segments: DiffSegment[]; oldText?: string; newText?: string }) {
  // Build left (old) and right (new) highlighted versions from segments
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
      {/* Old version */}
      <div className="border-r">
        <div className="px-3 py-1.5 bg-destructive/5 border-b">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive/70">Stara verzija</span>
        </div>
        <div className="p-3 text-sm leading-relaxed whitespace-pre-wrap">
          {leftParts.map((part, i) => (
            <span
              key={i}
              className={part.type === "removed"
                ? "bg-destructive/15 text-destructive line-through decoration-destructive/50 rounded-sm px-0.5"
                : "text-foreground/80"
              }
            >
              {part.text}
            </span>
          ))}
        </div>
      </div>
      {/* New version */}
      <div>
        <div className="px-3 py-1.5 bg-success/5 border-b">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-success/70">Nova verzija</span>
        </div>
        <div className="p-3 text-sm leading-relaxed whitespace-pre-wrap">
          {rightParts.map((part, i) => (
            <span
              key={i}
              className={part.type === "added"
                ? "bg-success/15 text-success-foreground font-medium rounded-sm px-0.5 border-b-2 border-success/30"
                : "text-foreground/80"
              }
            >
              {part.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Added article content ── */
function AddedContent({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-success/30 overflow-hidden">
      <div className="px-3 py-1.5 bg-success/5 border-b border-success/20">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-success/70">Novi tekst</span>
      </div>
      <div className="p-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/80 bg-success/5">
        {text}
      </div>
    </div>
  );
}

/* ── Removed article content ── */
function RemovedContent({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 overflow-hidden">
      <div className="px-3 py-1.5 bg-destructive/5 border-b border-destructive/20">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive/70">Uklonjeni tekst</span>
      </div>
      <div className="p-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/50 line-through bg-destructive/5">
        {text}
      </div>
    </div>
  );
}

/* ── Article card ── */
function DiffArticleCard({ diff, defaultExpanded, viewMode }: { diff: ArticleDiff; defaultExpanded: boolean; viewMode: ViewMode }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const config = STATUS_CONFIG[diff.status];
  const Icon = config.icon;

  const renderContent = () => {
    if (diff.status === "added") {
      return <AddedContent text={diff.newText || diff.segments.map(s => s.text).join("")} />;
    }
    if (diff.status === "removed") {
      return <RemovedContent text={diff.oldText || diff.segments.map(s => s.text).join("")} />;
    }
    if (diff.status === "modified") {
      return viewMode === "side-by-side"
        ? <SideBySideDiffContent segments={diff.segments} oldText={diff.oldText} newText={diff.newText} />
        : <InlineDiffContent segments={diff.segments} />;
    }
    return null;
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dotColor}`} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{diff.articleTitle}</span>
        </div>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${config.color}`}>
          <Icon className="h-2.5 w-2.5 mr-1" />
          {config.label}
        </Badge>
        {expanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        }
      </button>

      {expanded && diff.status !== "unchanged" && (
        <div className="border-t px-4 py-3 bg-card">
          {renderContent()}
        </div>
      )}
    </div>
  );
}

/* ── Main view ── */
export default function SourceDiffView({ diffResult, sourceName, oldVersion, newVersion, affectedCardCount, onClose }: Props) {
  const [filterStatus, setFilterStatus] = useState<"all" | "modified" | "added" | "removed">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");

  const filtered = useMemo(() => {
    if (filterStatus === "all") return diffResult.diffs.filter(d => d.status !== "unchanged");
    return diffResult.diffs.filter(d => d.status === filterStatus);
  }, [diffResult, filterStatus]);

  const { summary } = diffResult;

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
            {sourceName} — v{oldVersion} → v{newVersion}
          </p>
        </div>
        {/* View mode toggle */}
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

      {/* Filter tabs */}
      <div className="flex gap-1">
        {(["all", "modified", "added", "removed"] as const).map(status => {
          const labels = { all: "Sve promjene", modified: "Izmijenjeno", added: "Novo", removed: "Uklonjeno" };
          const counts = { all: summary.modified + summary.added + summary.removed, modified: summary.modified, added: summary.added, removed: summary.removed };
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
            <p className="text-sm">Nema promjena za prikazivanje u ovom filteru.</p>
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
