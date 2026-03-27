import { memo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import GraduationCap from "lucide-react/dist/esm/icons/graduation-cap";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import BookOpen from "lucide-react/dist/esm/icons/book-open";
interface Props {
  dueCount: number;
  hasCards: boolean;
  lastSourceLabel: string | null;
}

export const QuickActions = memo(function QuickActions({ dueCount, hasCards, lastSourceLabel }: Props) {
  if (!hasCards) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
      className="flex items-center gap-3 flex-wrap">
      <Link to="/learn"
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm">
        <GraduationCap className="h-4 w-4" />
        Nastavi učenje
      </Link>
      {dueCount > 0 && (
        <Link to="/review"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border bg-card text-sm font-medium hover:bg-secondary transition-colors">
          <RotateCcw className="h-4 w-4 text-warning" />
          Ponovi dospjele ({dueCount})
        </Link>
      )}
      {lastSourceLabel && (
        <Link to="/database"
          onClick={() => {
            sessionStorage.setItem("sr-database-tab", "sources");
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border bg-card text-sm font-medium hover:bg-secondary transition-colors">
          <BookOpen className="h-4 w-4 text-primary" />
          Otvori izvor
        </Link>
      )}
    </motion.div>
  );
});
