import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

export function NumberStepper({ value, onChange, min = 0, max = 100, step = 1, className }: NumberStepperProps) {
  const decrement = () => onChange(Math.max(min, value - step));
  const increment = () => onChange(Math.min(max, value + step));

  return (
    <div className={cn("inline-flex items-center rounded-md border border-input bg-background", className)}>
      <button
        type="button"
        onClick={decrement}
        disabled={value <= min}
        className="flex h-9 w-8 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-l-md transition-colors disabled:opacity-30 disabled:pointer-events-none"
        aria-label="Smanji"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="flex h-9 min-w-[2.5rem] items-center justify-center text-sm font-medium tabular-nums border-x border-input px-1">
        {value}
      </span>
      <button
        type="button"
        onClick={increment}
        disabled={value >= max}
        className="flex h-9 w-8 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-r-md transition-colors disabled:opacity-30 disabled:pointer-events-none"
        aria-label="Povećaj"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
