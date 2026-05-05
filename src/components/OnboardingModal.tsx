import { ArrowRight, ArrowLeft, X, CheckCircle2 } from "lucide-react";
import { useState, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";

import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
export interface OnboardingSlide {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  /** Use `content` for simple text or `bullets` for bullet lists */
  content?: string;
  bullets?: string[];
  /** Optional level badge */
  level?: string;
  levelColor?: string;
}

interface Props {
  slides: OnboardingSlide[];
  storageKey: string;
  onComplete: () => void;
  finishLabel?: string;
}

export function hasSeenOnboarding(key: string): boolean {
  return localStorage.getItem(key) === "true";
}

export function markOnboardingSeen(key: string) {
  localStorage.setItem(key, "true");
}

export default function OnboardingModal({ slides, storageKey, onComplete, finishLabel = "Počni" }: Props) {
  const [step, setStep] = useState(0);
  const titleId = useId();
  const slide = slides[step];
  const Icon = slide.icon;
  const isLast = step === slides.length - 1;

  const finish = () => {
    markOnboardingSeen(storageKey);
    onComplete();
  };

  /**
   * Close the modal WITHOUT marking onboarding as seen — the user accidentally
   * clicked the backdrop, so we'll re-show the modal on next session. The
   * explicit X button and "Počni" CTA still call `finish` (they're intentional).
   */
  const dismissForNow = () => {
    onComplete();
  };

  return (
    <Modal
      open
      onClose={dismissForNow}
      labelledBy={titleId}
      backdropClassName="bg-background/80 backdrop-blur-sm"
      panelClassName="relative w-full max-w-lg rounded-2xl border bg-card shadow-xl overflow-hidden"
    >
      <>
        {/* Skip */}
        <button
          onClick={finish}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors z-10"
          aria-label="Zatvori"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pt-6">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-6 bg-primary" : i < step ? "w-1.5 bg-primary/40" : "w-1.5 bg-secondary"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="p-8 pt-6"
          >
            <div className="flex flex-col items-center text-center mb-6">
              <div className={`p-4 rounded-2xl mb-4 ${slide.iconColor}`}>
                <Icon className="h-8 w-8" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <h3 id={titleId} className="text-xl font-semibold">{slide.title}</h3>
                {slide.level && slide.levelColor && (
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${slide.levelColor}`}>
                    {slide.level}
                  </span>
                )}
              </div>
              {slide.content && (
                <p className="text-sm text-muted-foreground max-w-sm whitespace-pre-line leading-relaxed">{slide.content}</p>
              )}
            </div>

            {slide.bullets && (
              <ul className="space-y-2.5 mb-8">
                {slide.bullets.map((bullet, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-start gap-3 text-sm"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span className="text-muted-foreground">{bullet}</span>
                  </motion.li>
                ))}
              </ul>
            )}

            {/* Navigation */}
            <div className="flex items-center gap-3">
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep(s => s - 1)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Nazad
                </Button>
              )}
              {isLast ? (
                <Button onClick={finish} className="flex-1">
                  {finishLabel} <CheckCircle2 className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={() => setStep(s => s + 1)} className="flex-1">
                  Dalje <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </>
    </Modal>
  );
}
