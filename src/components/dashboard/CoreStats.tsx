import { Clock, TrendingDown } from "lucide-react";
import { memo } from "react";
import { Link } from "react-router-dom";

interface Props {
  due: number;
  pendingFirstReview: number;
  weakest: { id: string; name: string; score: number } | null;
}

export const CoreStats = memo(function CoreStats({ due, pendingFirstReview, weakest }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Link to="/review">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 glass-card p-5 space-y-2 hover:border-gold/40 transition-colors cursor-pointer"
          style={{ animationDelay: "80ms", animationFillMode: "both" }}>
          <Clock className="h-5 w-5 text-primary mb-1" />
          <p className="text-4xl font-bold">{due}</p>
          <p className="text-sm text-muted-foreground">Za ponavljanje</p>
          {pendingFirstReview > 0 && <p className="text-xs text-primary">+ {pendingFirstReview} čeka prvo pon.</p>}
        </div>
      </Link>
      {weakest ? (
        <Link to={`/category/${weakest.id}`}>
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 glass-card p-5 space-y-2 hover:border-gold/40 transition-colors cursor-pointer"
            style={{ animationDelay: "140ms", animationFillMode: "both" }}>
            <TrendingDown className="h-5 w-5 text-destructive mb-1" />
            <p className="text-xl font-bold truncate" title={weakest.name}>{weakest.name}</p>
            <p className="text-sm text-muted-foreground">Najslabija kategorija</p>
            <p className="text-xs text-muted-foreground">Rezultat: {Math.round(weakest.score)}%</p>
          </div>
        </Link>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 glass-card p-5 space-y-2 opacity-60"
          style={{ animationDelay: "140ms", animationFillMode: "both" }}>
          <TrendingDown className="h-5 w-5 text-muted-foreground mb-1" />
          <p className="text-xl font-bold">—</p>
          <p className="text-sm text-muted-foreground">Najslabija kategorija</p>
          <p className="text-xs text-muted-foreground">Nema podataka</p>
        </div>
      )}
    </div>
  );
});
