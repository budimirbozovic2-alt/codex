import React from "react";
import { motion } from "framer-motion";
import { getMasteryColor } from "@/components/KnowledgeMap";
import BookOpen from "lucide-react/dist/esm/icons/book-open";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import ArrowUp from "lucide-react/dist/esm/icons/arrow-up";
import ArrowDown from "lucide-react/dist/esm/icons/arrow-down";

interface SubcategoryCardProps {
  name: string;
  count: number;
  levels: number[];
  index: number;
  realIndex: number;
  subsLength: number;
  reorderMode: boolean;
  isOstalo: boolean;
  onNavigate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function SubcategoryCardInner({
  name, count, levels, index, realIndex, subsLength,
  reorderMode, isOstalo, onNavigate, onMoveUp, onMoveDown,
}: SubcategoryCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      className="group flex items-center gap-2"
    >
      {reorderMode && !isOstalo && (
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button
            onClick={onMoveUp}
            disabled={realIndex <= 0}
            className="p-1 rounded hover:bg-secondary disabled:opacity-20 transition-colors"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={realIndex >= subsLength - 1}
            className="p-1 rounded hover:bg-secondary disabled:opacity-20 transition-colors"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>
      )}
      <button
        onClick={onNavigate}
        className="flex-1 flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-secondary/40 transition-colors text-left"
      >
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{count} kartica</p>
          <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-secondary mt-2">
            {levels.map((c, lvl) =>
              c > 0 ? (
                <div key={lvl} style={{ width: `${(c / count) * 100}%`, backgroundColor: getMasteryColor(lvl) }} />
              ) : null
            )}
          </div>
        </div>
        {!reorderMode && (
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        )}
      </button>
    </motion.div>
  );
}

const SubcategoryCard = React.memo(SubcategoryCardInner);

export default SubcategoryCard;
