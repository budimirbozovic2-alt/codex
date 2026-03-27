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
    const opacity = 0.2 + sunArc * 0.1;

    return {
      background: `linear-gradient(180deg, hsla(${hue}, ${saturation}%, ${lightnessTop}%, ${opacity}) 0%, hsla(${hue + 10}, ${saturation - 5}%, ${lightnessBottom}%, ${opacity * 0.6}) 100%)`,
    };
  }, [dayPhase, warmth]);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 transition-all duration-1000"
      style={gradient}
      aria-hidden
    />
  );
});
