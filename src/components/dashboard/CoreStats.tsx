import { Clock, BookOpen } from "lucide-react";
import { memo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
interface Props {
  due: number;
  learnedSections: number;
  totalSections: number;
  pendingFirstReview: number;
}

export const CoreStats = memo(function CoreStats({ due, learnedSections, totalSections, pendingFirstReview }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Link to="/review">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="glass-card p-5 space-y-2 hover:border-gold/40 transition-colors cursor-pointer">
          <Clock className="h-5 w-5 text-primary mb-1" />
          <p className="text-4xl font-display">{due}</p>
          <p className="text-sm text-muted-foreground">Za ponavljanje</p>
          {pendingFirstReview > 0 && <p className="text-xs text-primary">+ {pendingFirstReview} čeka prvo pon.</p>}
        </motion.div>
      </Link>
      <Link to="/database">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
          className="glass-card p-5 space-y-2 hover:border-gold/40 transition-colors cursor-pointer">
          <BookOpen className="h-5 w-5 text-success mb-1" />
          <p className="text-4xl font-display">{learnedSections}</p>
          <p className="text-sm text-muted-foreground">Naučene cjeline</p>
          <p className="text-xs text-muted-foreground">od {totalSections} ukupno</p>
        </motion.div>
      </Link>
    </div>
  );
});
