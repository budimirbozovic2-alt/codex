import { HelpCircle } from "lucide-react";
import { useState, lazy, Suspense } from "react";
import SpeedReader from "@/components/SpeedReader";
import { AnimatePresence } from "framer-motion";

const SpeedReaderOnboarding = lazy(() => import("@/components/SpeedReaderOnboarding"));

export default function SpeedReaderPage() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowOnboarding(true)}
        className="absolute top-0 right-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors z-10"
        title="Vodič za brzo čitanje"
        aria-label="Vodič za brzo čitanje"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <SpeedReader />
      <AnimatePresence>
        {showOnboarding && (
          <Suspense fallback={null}>
            <SpeedReaderOnboarding onComplete={() => setShowOnboarding(false)} />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
