import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { X, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Source } from "@/lib/db";
import { ContentRenderer } from "@/components/ui/ContentRenderer";
import { deriveHtml } from "@/lib/editor-v4/derived";

interface Props {
  source: Source;
  categoryId: string;
  onClose: () => void;
}

/**
 * Read-only side panel rendering a Source for parallel reading. PR-7c (M3 #4):
 * legacy `source.htmlContent` is dropped post-v22 — derive HTML from the
 * canonical `contentDoc` (cached via WeakMap in `derived.ts`).
 */
export default function SourceSidePanel({ source, categoryId, onClose }: Props) {
  const navigate = useNavigate();
  const html = useMemo(() => deriveHtml(source.contentDoc), [source.contentDoc]);

  const openFullReader = () => {
    sessionStorage.setItem("sr-open-source-id", source.id);
    navigate(`/category/${categoryId}`);
  };

  return (
    <div className="flex flex-col h-full border border-border rounded-md bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{source.title}</div>
          {source.officialGazetteInfo && (
            <div className="text-[10px] text-muted-foreground truncate">{source.officialGazetteInfo}</div>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={openFullReader}
          className="h-7 gap-1 text-xs"
          aria-label="Otvori puni prikaz izvora"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Pun prikaz</span>
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="h-7 w-7"
          aria-label="Zatvori bočni prikaz izvora"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ContentRenderer
        className="prose prose-sm dark:prose-invert max-w-none p-4 overflow-y-auto flex-1 text-foreground"
        doc={source.contentDoc}
      />
    </div>
  );
}
