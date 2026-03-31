import { Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Source } from "@/lib/sources-storage";

/**
 * Props for the SourceHeader component.
 */
interface Props {
  /** The source whose header information is to be displayed */
  source: Source;
}

/**
 * Component that displays the source's title, date, and version.
 */
export function SourceHeader({ source }: Props) {
  return (
    <div className="min-w-0 flex-1">
      <h2 className="font-semibold text-lg truncate">{source.title}</h2>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {source.date}
        </span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">v{source.version}</Badge>
      </div>
    </div>
  );
}
