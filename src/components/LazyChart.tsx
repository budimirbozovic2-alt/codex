import { useState, useCallback, useRef, ReactNode } from "react";
import { default as RefreshCw } from "lucide-react/dist/esm/icons/refresh-cw";
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

interface Props<T> {
  /** Label shown in the header */
  label: string;
  /** Icon component to show next to label */
  icon: ReactNode;
  /** The compute function — called only on refresh click */
  compute: () => T;
  /** Render function: receives computed data */
  children: (data: T) => ReactNode;
  /** Optional delay class for animation */
  delay?: number;
}

/**
 * A chart wrapper that defers heavy computation until the user clicks Refresh.
 * Shows shimmer skeleton while computing.
 */
export default function LazyChart<T>({ label, icon, compute, children, delay = 0 }: Props<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [computed, setComputed] = useState(false);
  const computeRef = useRef(compute);
  computeRef.current = compute;

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setComputed(false);
    // Use requestIdleCallback or setTimeout to keep UI thread responsive
    const run = () => {
      const result = computeRef.current();
      setData(result);
      setLoading(false);
      setComputed(true);
    };
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(run, { timeout: 3000 });
    } else {
      setTimeout(run, 50);
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.1 }}
      className="rounded-xl bg-card border p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-serif text-lg">{label}</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          title="Osviježi proračun"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-[180px] w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          </motion.div>
        ) : computed && data !== null ? (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {children(data)}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-8 text-center text-muted-foreground"
          >
            <p className="text-sm">Klikni <RefreshCw className="h-3.5 w-3.5 inline mx-1" /> za proračun</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
