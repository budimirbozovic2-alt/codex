/* eslint-disable react-refresh/only-export-components --
 * Co-exports `hasSeenOnboarding` / `markOnboardingSeen` localStorage helpers
 * tightly coupled to the modal lifecycle. Splitting would fragment a 3-line
 * helper API across files for no benefit. HMR boundary loss is acceptable.
 */
import { ArrowRight, ArrowLeft, X, CheckCircle2 } from "lucide-react";
import { useState, useId } from "react";
import { m, AnimatePresence } from "@/lib/motion";

import Modal from "@/components/ui/DialogShell";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import { ONBOARDING_PRESETS, type OnboardingPresetId } from "@/components/onboarding/presets";
export interface OnboardingSlide {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  content?: string;
  bullets?: string[];
  level?: string;
  levelColor?: string;
}

type Props =
  | { preset: OnboardingPresetId; onComplete: () => void; slides?: never; storageKey?: never; finishLabel?: never }
  | { preset?: never; slides: OnboardingSlide[]; storageKey: string; onComplete: () => void; finishLabel?: string };

export function hasSeenOnboarding(key: string): boolean {
  return localStorage.getItem(key) === "true";
}

export function markOnboardingSeen(key: string) {
  localStorage.setItem(key, "true");
}

export default function OnboardingModal(props: Props) {
  const resolved = props.preset
    ? { slides: ONBOARDING_PRESETS[props.preset].slides, storageKey: ONBOARDING_PRESETS[props.preset].key, finishLabel: ONBOARDING_PRESETS[props.preset].finish }
    : { slides: props.slides, storageKey: props.storageKey, finishLabel: props.finishLabel ?? "Počni" };
  const { slides, storageKey, finishLabel } = resolved;
  const { onComplete } = props;
  const [step, setStep] = useState(0);
  const titleId = useId();
  const slide = slides[step];
  const Icon = slide.icon;
  const isLast = step === slides.length - 1;

  const finish = () => {
    markOnboardingSeen(storageKey);
    onComplete();
  };

  const dismissForNow = () => {
    onComplete();
  };

  return (
    <Modal
      open
      onClose={dismissForNow}
      labelledBy={titleId}
      backdropClassName="bg-background/80 backdrop-blur-md"
      panelClassName="relative w-full max-w-lg rounded-2xl border border-hairline bg-card shadow-floating overflow-hidden"
    >
      <>
        {/* Hero gradient header */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-40 pointer-events-none bg-gradient-to-br from-primary/10 via-surface-2/60 to-transparent" />

        {/* Skip */}
        <button
          onClick={finish}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors z-10"
          aria-label="Zatvori"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>

        {/* Hairline progress */}
        <div className="absolute inset-x-0 top-0 h-px bg-hairline overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${((step + 1) / slides.length) * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-center gap-1.5 pt-8">
          <span className="text-eyebrow text-muted-foreground tabular">
            {step + 1} / {slides.length}
          </span>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <m.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
            className="relative p-10 pt-6"
          >
            <div className="flex flex-col items-center text-center mb-8">
              <div className={`p-5 rounded-2xl mb-5 shadow-soft ${slide.iconColor}`}>
                <Icon className="h-9 w-9" strokeWidth={1.5} />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <h3 id={titleId} className="text-display text-3xl font-semibold tracking-tighter text-balance">{slide.title}</h3>
                {slide.level && slide.levelColor && (
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full ${slide.levelColor}`}>
                    {slide.level}
                  </span>
                )}
              </div>
              {slide.content && (
                <p className="text-[15px] text-muted-foreground max-w-sm whitespace-pre-line leading-relaxed text-pretty">{slide.content}</p>
              )}
            </div>

            {slide.bullets && (
              <ul className="space-y-3 mb-10">
                {slide.bullets.map((bullet, i) => (
                  <m.li
                    key={i}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
                    className="flex items-start gap-3 text-sm"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0 shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
                    <span className="text-foreground/80">{bullet}</span>
                  </m.li>
                ))}
              </ul>
            )}

            {/* Navigation */}
            <div className="flex items-center gap-3">
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep(s => s - 1)} className="flex-1 hover-lift pressable h-10">
                  <ArrowLeft className="h-4 w-4 mr-2" strokeWidth={1.7} /> Nazad
                </Button>
              )}
              {isLast ? (
                <Button onClick={finish} className="flex-1 hover-lift pressable h-10 shadow-elevated">
                  {finishLabel} <CheckCircle2 className="h-4 w-4 ml-2" strokeWidth={1.7} />
                </Button>
              ) : (
                <Button onClick={() => setStep(s => s + 1)} className="flex-1 hover-lift pressable h-10 shadow-elevated">
                  Dalje <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.7} />
                </Button>
              )}
            </div>
          </m.div>
        </AnimatePresence>
      </>
    </Modal>
  );
}
