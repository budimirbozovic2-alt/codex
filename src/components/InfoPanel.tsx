import { useState } from "react";


import { motion, AnimatePresence } from "framer-motion";
import Info from "lucide-react/dist/esm/icons/info";
import X from "lucide-react/dist/esm/icons/x";
interface InfoPanelProps {
  title: string;
  children: React.ReactNode;
}

export default function InfoPanel({ title, children }: InfoPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary"
      >
        <Info className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Kako funkcioniše?</span>
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              className="absolute right-0 top-8 w-80 rounded-xl border bg-card p-4 shadow-lg z-50 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{title}</span>
                <button onClick={() => setOpen(false)} className="p-0.5 rounded hover:bg-secondary text-muted-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
                {children}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
