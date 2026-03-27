import { memo, useMemo } from "react";

interface Props {
  dayPhase: number;
  warmth: number;
}

/**
 * Subtle ambient gradient — time-of-day + learning velocity.
 * Kept minimal: a gentle tint, not a skybox.
 */
export const ForumAtmosphere = memo(function ForumAtmosphere({ dayPhase, warmth }: Props) {
  const gradient = useMemo(() => {
    const sunArc = Math.sin(dayPhase * Math.PI);
    const hue = 230 - sunArc * 190 * warmth;
    const saturation = 10 + sunArc * 25 + warmth * 15;
    const lightnessTop = 5 + sunArc * 4;
    const lightnessBottom = 8 + sunArc * 6;
    const opacity = 0.4 + sunArc * 0.2;

    return {
      background: `linear-gradient(180deg, hsla(${hue}, ${saturation}%, ${lightnessTop}%, ${opacity}) 0%, hsla(${hue + 10}, ${saturation - 5}%, ${lightnessBottom}%, ${opacity * 0.6}) 100%)`,
    };
  }, [dayPhase, warmth]);

  const glowOpacity = useMemo(() => {
    const sunArc = Math.sin(dayPhase * Math.PI);
    const isTransition = 1 - Math.abs(sunArc - 0.5) * 2;
    return isTransition * warmth * 0.3;
  }, [dayPhase, warmth]);

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-all duration-1000"
        style={gradient}
        aria-hidden
      />
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-0 h-48 transition-opacity duration-1000"
        style={{
          background: `radial-gradient(ellipse 120% 100% at 50% 100%, hsl(var(--gold) / ${glowOpacity}), transparent 70%)`,
        }}
        aria-hidden
      />
    </>
  );
});
