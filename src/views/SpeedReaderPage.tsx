import { useState, lazy, Suspense } from "react";
import SpeedReader from "@/components/SpeedReader";
import { AnimatePresence } from "framer-motion";

const SpeedReaderOnboarding = lazy(() => import("@/components/SpeedReaderOnboarding"));

export default function SpeedReaderPage() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  return (
    <div>
      <SpeedReader onShowOnboarding={() => setShowOnboarding(true)} />
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
